export async function onRequestGet(context) {
  const url = new URL(context.request.url)
  const country = (url.searchParams.get('country') || '').trim().toUpperCase()
  const year = Number(url.searchParams.get('year'))

  if (!/^[A-Z]{2}$/.test(country) || !Number.isInteger(year) || year < 1900 || year > 2200) {
    return Response.json({ error: 'Use a two-letter ISO country code and a valid year.' }, { status: 400 })
  }

  const attempts = [
    `https://date.nager.at/api/v4/Holidays/${encodeURIComponent(country)}/${year}`,
    `https://date.nager.at/api/v3/PublicHolidays/${year}/${encodeURIComponent(country)}`
  ]
  const failures = []

  for (const endpoint of attempts) {
    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } })
      if (!response.ok) {
        failures.push(`${response.status} ${response.statusText}`)
        continue
      }
      const rows = await response.json()
      const normalized = Array.isArray(rows) ? rows.map(normalizeHoliday).filter(Boolean) : []
      return Response.json(normalized, {
        headers: {
          'Cache-Control': 'public, max-age=86400',
          'X-PhotoFind-Holiday-Source': endpoint.includes('/v4/') ? 'nager-v4' : 'nager-v3'
        }
      })
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'upstream fetch failed')
    }
  }

  return Response.json({ error: `Holiday provider unavailable for ${country} ${year}.`, details: failures }, { status: 502 })
}

function normalizeHoliday(row) {
  if (!row || typeof row !== 'object' || typeof row.date !== 'string') return null
  const title = typeof row.localName === 'string' && row.localName.trim()
    ? row.localName.trim()
    : typeof row.name === 'string' && row.name.trim()
      ? row.name.trim()
      : null
  if (!title) return null

  const holidayTypes = Array.isArray(row.holidayTypes) ? row.holidayTypes : []
  const publicHoliday = row.nationalHoliday !== false && (holidayTypes.length === 0 || holidayTypes.includes('Public'))
  if (!publicHoliday) return null

  return {
    date: row.date,
    name: title,
    countryCode: typeof row.countryCode === 'string' ? row.countryCode : undefined,
    nationalHoliday: true,
    holidayTypes: holidayTypes.length ? holidayTypes : ['Public']
  }
}
