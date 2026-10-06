import type { On, RenderElement, RenderSurface } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { cellWidth, formatChange, formatPrice, misUrl, normalizeSymbol, parseMis } from '../hooks/quotes'

// A trimmed MIS response: a TWSE stock, the empty stub the wrong exchange answers,
// the TAIEX index, and a stock between trades (z is "-", only the order book has a price).
const MIS = JSON.stringify({
  msgArray: [
    { c: '2330', n: '台積電', z: '2585.0000', y: '2575.0000', ex: 'tse' },
    { c: '', z: '-' },
    { c: 't00', n: '發行量加權股價指數', z: '49822.55', y: '49712.04', ex: 'tse' },
    { c: '2317', n: '鴻海', z: '-', pz: '-', b: '200.5000_200.0000_', a: '201.0000_', y: '205.0000', ex: 'tse' },
  ],
})

// Tuesday 10:00 Taipei: the market is open.
const MARKET_OPEN = Date.UTC(2026, 9, 6, 2, 0)

/** The engine beneath the plugin: a stored watchlist, an open market, MIS answering, a session that starts. */
function setup(on: On, watchlist: string[], surfaces: RenderSurface[] = ['terminal']) {
  mock.store(on, { watchlist })
  const clock = mock.clock(on, { now: MARKET_OPEN })
  const calls = { fetch: 0 }
  on('http.fetch', async () => {
    calls.fetch += 1
    return { value: { status: 200, ok: true, headers: {}, text: MIS } }
  })
  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  on('session.surfaces', async () => ({ value: [...surfaces] }))
  on('session.attach', async ($, e) => {
    surfaces.push(e.surface)
    return { clientId: e.clientId }
  })
  on('session.detach', async ($, e) => {
    surfaces.splice(surfaces.indexOf(e.surface), 1)
    return { clientId: e.clientId }
  })
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  // What the engine draws when the band yields.
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine') as RenderElement
  })

  return { clock, calls }
}

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

describe('quotes', () => {
  test('normalizes codes and index aliases', () => {
    expect(normalizeSymbol('2330')).toBe('2330')
    expect(normalizeSymbol('2330.TW')).toBe('2330')
    expect(normalizeSymbol('00631l')).toBe('00631L')
    expect(normalizeSymbol('加權')).toBe('t00')
    expect(normalizeSymbol('TAIEX')).toBe('t00')
    expect(normalizeSymbol('櫃買')).toBe('o00')
    expect(normalizeSymbol('AAPL')).toBeUndefined()
  })

  test('asks both exchanges for stocks and one for indices', () => {
    const url = decodeURIComponent(misUrl(['2330', 't00']))
    expect(url).toContain('ex_ch=tse_2330.tw|otc_2330.tw|tse_t00.tw&')
  })

  test('parses rows in watchlist order, skipping stubs and missing codes', () => {
    const quotes = parseMis(MIS, ['t00', '2317', '9999', '2330'])
    expect(quotes.map(q => q.symbol)).toEqual(['t00', '2317', '2330'])
    expect(quotes[0]?.label).toBe('加權')
    expect(quotes[1]?.price).toBe(200.5)
    expect(quotes[2]?.changePercent.toFixed(2)).toBe('0.39')
  })

  test('formats prices, changes and CJK widths', () => {
    expect(formatPrice(2585)).toBe('2585')
    expect(formatPrice(85.3)).toBe('85.3')
    expect(formatPrice(49822.55)).toBe('49823')
    expect(formatChange(0.3883)).toBe('▲0.39%')
    expect(formatChange(-2.2)).toBe('▼2.20%')
    expect(cellWidth('台積電 2585')).toBe(11)
  })
})

describe('band', () => {
  test('draws the watchlist with red for gains and green for losses', async ($, on) => {
    const { clock } = setup(on, ['2330', '2317'])

    await $.session.start(START)
    await clock.settle()

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'stock-ticker', surface, ...BAND })
      const up = await ui.find({ type: 'Text', text: '▲0.39%' })
      const down = await ui.find({ type: 'Text', text: '▼2.20%' })
      expect(up?.props.color).toBe('red')
      expect(down?.props.color).toBe('green')
      expect(await ui.find({ type: 'Text', text: /台積電/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('green-up flips the colors', { options: { colors: 'green-up' } }, async ($, on) => {
    const { clock } = setup(on, ['2330'])

    await $.session.start(START)
    await clock.settle()
    const ui = await $.ui.mount({ plugin: 'stock-ticker', surface: 'terminal', ...BAND })
    expect((await ui.find({ type: 'Text', text: '▲0.39%' }))?.props.color).toBe('green')
    await ui.unmount()
  })

  test('/stock add and rm edit the stored watchlist', async ($, on) => {
    const { clock } = setup(on, ['2330'])
    await $.session.start(START)
    await clock.settle()

    const added = await $.command.run({ command: 'stock', args: 'add 2317 加權 nope' } as never)
    expect(added).toMatchObject({ text: expect.stringContaining('2330 2317 t00') })
    expect(added).toMatchObject({ text: expect.stringContaining('nope') })

    const removed = await $.command.run({ command: 'stock', args: 'rm 2330' } as never)
    expect(removed).toMatchObject({ text: '自選股：2317 t00' })

    const missing = await $.command.run({ command: 'stock', args: 'rm 4920' } as never)
    expect(missing).toMatchObject({ text: '自選股：2317 t00\n不在自選股：4920' })
  })

  test('/stock add stops at 10 symbols and says which were left out', async ($, on) => {
    const { clock } = setup(on, ['1101', '1102', '1103', '1104', '1105', '1106', '1107', '1108', '1109'])
    await $.session.start(START)
    await clock.settle()

    const added = await $.command.run({ command: 'stock', args: 'add 2330 2317 2454' } as never)
    expect(added).toMatchObject({ text: expect.stringContaining('最多 10 檔，未加入：2317 2454') })
    expect(added).toMatchObject({ text: expect.stringContaining('1109 2330') })
  })

  test('a narrow band shows how many quotes did not fit', async ($, on) => {
    const { clock } = setup(on, ['2330', 't00', '2317'])
    await $.session.start(START)
    await clock.settle()

    // Room for one quote plus the "+N" marker.
    const narrow = { ...BAND, props: { ...BAND.props, bodyColumns: 28 } }
    const ui = await $.ui.mount({ plugin: 'stock-ticker', surface: 'terminal', ...narrow })
    expect(await ui.find({ type: 'Text', text: /台積電/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /加權/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '+2' })).toBeDefined()
    await ui.unmount()
  })

  test('an idle session stops polling until it is used again', async ($, on) => {
    const { clock, calls } = setup(on, ['2330'])
    await $.session.start(START)
    await clock.settle()
    expect(calls.fetch).toBe(1)

    await clock.advance(30_000)
    expect(calls.fetch).toBe(7)

    // Five minutes with no prompt or command: polling stops.
    await clock.advance(5 * 60_000)
    const idle = calls.fetch
    await clock.advance(60_000)
    expect(calls.fetch).toBe(idle)

    await $.command.run({ command: 'stock', args: 'list' } as never)
    await clock.advance(10_000)
    expect(calls.fetch).toBe(idle + 2)
  })

  test('a desktop session polls while on screen and stops once switched away', async ($, on) => {
    const { clock, calls } = setup(on, ['2330'], [])
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
    await clock.settle()

    // On screen: polls past the idle limit, no prompt needed.
    await clock.advance(10 * 60_000)
    const watched = calls.fetch
    expect(watched).toBeGreaterThan(100)

    await $.session.detach({ surface: 'desktop', clientId: 'desktop:default', reason: 'detach' })
    await clock.advance(60_000)
    expect(calls.fetch).toBe(watched)

    // Back on screen: polling picks up at the next tick.
    await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
    await clock.settle()
    expect(calls.fetch).toBe(watched)
    await clock.advance(10_000)
    expect(calls.fetch).toBe(watched + 2)
  })

  test('drawing stale quotes in an idle terminal session resumes polling', async ($, on) => {
    const { clock, calls } = setup(on, ['2330'])
    await $.session.start(START)
    await clock.advance(6 * 60_000)
    const idle = calls.fetch

    const ui = await $.ui.mount({ plugin: 'stock-ticker', surface: 'terminal', ...BAND })
    await clock.settle()
    expect(calls.fetch).toBe(idle)
    await clock.advance(5_000)
    expect(calls.fetch).toBe(idle + 1)
    await ui.unmount()
  })

  test('/stock off hides the band', async ($, on) => {
    const { clock } = setup(on, ['2330'])
    await $.session.start(START)
    await clock.settle()

    await $.command.run({ command: 'stock', args: 'off' } as never)
    const ui = await $.ui.mount({ plugin: 'stock-ticker', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /台積電/ })).toBeUndefined()
    await ui.unmount()
  })
})
