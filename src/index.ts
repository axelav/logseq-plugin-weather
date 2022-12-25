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
    key: 'localCoordinates',
    type: 'string',
    title: 'Local Coordinates',
    description:
      "Set your local coordinates in the format 'latitude, longitude'",
    default: '44.590959, -104.698514',
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
    const res = await fetch(
      `https://weather-api.honkytonkin.workers.dev?lat=${latitude}&lon=${longitude}`
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

  await logseq.Editor.insertBatchBlock(srcBlock, [
    {
      content: '[[Daily Weather]]',
      children: [
        {
          content: `forecast:: ${forecast}`,
        },
        {
          content: `temperature:: ${temperature}`,
        },
        {
          content: `humidity:: ${humidity}`,
        },
        {
          content: `wind:: ${wind}`,
        },
        {
          content: `sun:: ${toLocaleTimeString(sunrise)} / ${toLocaleTimeString(
            sunset
          )}`,
        },
        {
          content: `moon:: ${toLocaleTimeString(
            moonrise
          )} / ${toLocaleTimeString(moonset)}`,
        },
        {
          content: `location:: ${location
            .split(',')
            .map((s) => `[[${s.trim()}]]`)
            .join(', ')}`,
        },
      ],
    },
  ])
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
}

logseq.ready(main).catch(console.error)
