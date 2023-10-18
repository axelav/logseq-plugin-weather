import '@logseq/libs'
import {
  BlockIdentity,
  SettingSchemaDesc,
} from '@logseq/libs/dist/LSPlugin.user'

// TODO
// - use geolocation API?

interface Coordinates {
  latitude: string
  longitude: string
}

let settings: SettingSchemaDesc[] = [
  {
    key: 'useSingleBlock',
    type: 'boolean',
    title: 'Use a single block for output?',
    description:
      'Write all output to a single block instead of one for each property.',
    default: false,
  },
  {
    key: 'localCoordinates',
    type: 'string',
    title: 'Local Coordinates',
    description:
      "Set your local coordinates in the format 'latitude, longitude'",
    default: '44.590959, -104.698514',
  },
  {
    key: 'units',
    type: 'enum',
    title: 'Units',
    description:
      'Choose imperial (Fahrenheit, miles per hour) or metric (Celsius, meters per second).',
    enumChoices: ['imperial', 'metric'],
    enumPicker: 'select',
    default: ['imperial'],
  },
  {
    key: 'includeLocation',
    type: 'boolean',
    title: 'Include location?',
    description: 'Attempt to find nearest municipalities.',
    default: true,
  },

  {
    key: 'includeSun',
    type: 'boolean',
    title: 'Include sunrise and sunset?',
    description: 'Add sunrise and sunset data to the output.',
    default: true,
  },
  {
    key: 'includeMoon',
    type: 'boolean',
    title: 'Include moonrise and moonset?',
    description: 'Add moonrise and moonset data to the output.',
    default: true,
  },
  {
    key: 'includeWind',
    type: 'boolean',
    title: 'Include wind speed?',
    description: 'Add wind speed data to the output.',
    default: true,
  },
  {
    key: 'includeHumidity',
    type: 'boolean',
    title: 'Include humidity?',
    description: 'Add humidity data to the output.',
    default: true,
  },
  {
    key: 'enableSlashCommand',
    type: 'boolean',
    title: 'Enable slash command?',
    description: 'Enable the "Add current weather data" slash command.',
    default: true,
  },
]

const parseQuery = (query: string) => {
  if (!query.trim()) {
    return
  }

  const [latitude, longitude] = query.split(',')

  if (!latitude || !longitude) {
    return null
  }

  return { latitude: latitude.trim(), longitude: longitude.trim() }
}

const toLocaleTimeString = (isoStr: string) =>
  new Date(isoStr).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })

interface WeatherResponse {
  forecast: string
  temperature: string
  humidity: string
  wind: string
  sunrise: string
  sunset: string
  moonrise: string
  moonset: string
  location: string
}

const runPlugin = async (e: { uuid: string }) => {
  const query = (await logseq.Editor.getBlock(e.uuid))?.content.split('\n')[0]

  const coords = parseQuery(query || logseq.settings?.localCoordinates)

  if (!coords) {
    return logseq.UI.showMsg(
      'logseq-weather-plugin :: Could not parse latitude and longitude from block!',
      'error'
    )
  }

  try {
    const weatherResponse = await getWeatherData(coords)

    if (!weatherResponse) {
      return logseq.UI.showMsg('logseq-weather-plugin :: No results!')
    }

    writeWeatherData(weatherResponse, e.uuid)

    if (query) {
      await logseq.Editor.removeBlock(e.uuid)
    }
  } catch (err) {
    console.error('logseq-weather-plugin :: Error: ', err)
  }
}

const getWeatherData = async ({ latitude, longitude }: Coordinates) => {
  try {
    const units = logseq.settings?.units === 'metric' ? '&metric=t' : ''

    const res = await fetch(
      `https://endpoints.deno.dev/weather?lat=${latitude}&lon=${longitude}${units}`
    )

    if (!res.ok) {
      const text = await res.text()

      return Promise.reject(text)
    } else {
      return res.json()
    }
  } catch (err) {
    console.error(`logseq-weather-plugin :: Error fetching weather`, err)
  }
}

const writeWeatherData = async (
  weatherResponse: WeatherResponse,
  srcBlock: BlockIdentity
) => {
  const {
    forecast,
    temperature,
    humidity,
    wind,
    sunrise,
    sunset,
    moonrise,
    moonset,
    location,
  } = weatherResponse

  const sunStr = `${toLocaleTimeString(sunrise)} / ${toLocaleTimeString(
    sunset
  )}`
  const moonStr = `${toLocaleTimeString(moonrise)} / ${toLocaleTimeString(
    moonset
  )}`
  const locationStr = location
    .split(',')
    .map((s) => `[[${s.trim()}]]`)
    .join(', ')

  if (logseq.settings?.useSingleBlock) {
    let content = `[[Daily Weather]]\nforecast:: ${forecast}\ntemperature:: ${temperature}`

    if (logseq.settings?.includeHumidity) {
      content = content.concat(`\nhumidity:: ${humidity}`)
    }

    if (logseq.settings?.includeWind) {
      content = content.concat(`\nwind:: ${wind}`)
    }

    if (logseq.settings?.includeSun) {
      content = content.concat(`\nsun:: ${sunStr}`)
    }

    if (logseq.settings?.includeMoon) {
      content = content.concat(`\nmoon:: ${moonStr}`)
    }

    if (logseq.settings?.includeLocation) {
      content = content.concat(`\nlocation:: ${locationStr}`)
    }

    await logseq.Editor.updateBlock(srcBlock, content)
  } else {
    const children = [
      {
        content: `forecast:: ${forecast}`,
      },
      {
        content: `temperature:: ${temperature}`,
      },
    ]

    if (logseq.settings?.includeHumidity) {
      children.push({
        content: `humidity:: ${humidity}`,
      })
    }

    if (logseq.settings?.includeWind) {
      children.push({
        content: `wind:: ${wind}`,
      })
    }

    if (logseq.settings?.includeSun) {
      children.push({
        content: `sun:: ${sunStr}`,
      })
    }

    if (logseq.settings?.includeMoon) {
      children.push({
        content: `moon:: ${moonStr}`,
      })
    }

    if (logseq.settings?.includeLocation) {
      children.push({
        content: `location:: ${locationStr}`,
      })
    }

    await logseq.Editor.insertBatchBlock(srcBlock, [
      {
        content: '[[Daily Weather]]',
        children,
      },
    ])
  }
}

const main = () => {
  console.log('logseq-weather-plugin :: Loaded!')

  logseq.useSettingsSchema(settings)

  logseq.Editor.registerBlockContextMenuItem(
    'Add current weather data',
    async (e) => {
      console.log('logseq-weather-plugin :: Fetching results...')
      await runPlugin(e)
    }
  )

  if (logseq.settings?.enableSlashCommand) {
    logseq.Editor.registerSlashCommand('Add current weather data', async () => {
      console.log('logseq-weather-plugin :: Fetching results...')
      const e = await logseq.Editor.getCurrentBlock()

      if (e) {
        await runPlugin(e)
      }
    })
  }
}

logseq.ready(main).catch(console.error)
