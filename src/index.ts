import '@logseq/libs'
import { BlockIdentity } from '@logseq/libs/dist/LSPlugin.user'

// TODO
// - use geolocation API?

// FIXME: user config defaults
const DEFAULT_LATITUDE = '40.671082'
const DEFAULT_LONGITUDE = '-73.951625'

interface Coordinates {
  latitude: string
  longitude: string
}

const parseQuery = (query: string) => {
  if (!query) {
    return {
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
    }
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

  const coords = parseQuery(query)

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

    // TODO: ?? Delete the original block if it contained a pair of coords
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

  logseq.Editor.registerBlockContextMenuItem(
    'Add current weather data',
    async (e) => {
      console.log('logseq-weather-plugin :: Fetching results...')
      await runPlugin(e)
    }
  )
}

logseq.ready(main).catch(console.error)
