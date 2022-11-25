import '@logseq/libs'
import { BlockIdentity } from '@logseq/libs/dist/LSPlugin.user'

// TODO
// - use geolocation API?

// FIXME: user config / env vars!
const WEATHER_API_TOKEN = '3faec6b9127899a1c7136599eea02952'
const GOOGLE_MAPS_API_KEY = 'AIzaSyD1pT--8ooS5v26dNgTTciXpEkpneqyyJA'
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

const toLocaleTimeString = (dt: number) =>
  new Date(dt * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })

const getCity = (list: { types: string[]; long_name: string }[]) => {
  const city = list.find(
    (x) =>
      x.types.indexOf('locality') !== -1 ||
      x.types.indexOf('sublocality') !== -1
  )

  return city.long_name
}

const getState = (list: { types: string[]; long_name: string }[]) => {
  const state = list.find(
    (x) => x.types.indexOf('administrative_area_level_1') !== -1
  )

  return state.long_name
}

const doIt = async (e: { uuid: string }) => {
  const query = (await logseq.Editor.getBlock(e.uuid))?.content.split('\n')[0]

  const coords = parseQuery(query)

  if (!coords) {
    return logseq.UI.showMsg(
      'logseq-weather-plugin :: Could not parse latitude and longitude from block!',
      'error'
    )
  }

  try {
    const currentDay = await getWeatherForCurrentDay(coords)
    const address = await getAddress(coords)

    if (!currentDay) {
      return logseq.UI.showMsg('logseq-weather-plugin :: No results!')
    }

    writeWeatherData({ currentDay, address }, e.uuid)

    // TODO: ?? Delete the original block if it contained a pair of coords
    if (query) {
      await logseq.Editor.removeBlock(e.uuid)
    }
  } catch (err) {
    console.error('logseq-weather-plugin :: Error: ', err)
  }
}

const getWeatherForCurrentDay = async ({
  latitude,
  longitude,
}: Coordinates) => {
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/onecall?lat=${latitude}&lon=${longitude}&units=imperial&appid=${WEATHER_API_TOKEN}`
    )

    if (!res.ok) {
      const text = await res.text()

      return Promise.reject(text)
    } else {
      const json = await res.json()

      return json.daily ? json.daily[0] : null
    }
  } catch (err) {
    console.error(`logseq-weather-plugin :: Error fetching weather`, err)
  }
}

const getAddress = async ({ latitude, longitude }: Coordinates) => {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
    )

    if (!res.ok) {
      const text = await res.text()

      return Promise.reject(text)
    } else {
      const json = await res.json()

      return json.results?.length > 0
        ? json.results[0].address_components
        : null
    }
  } catch (err) {
    console.error(`logseq-weather-plugin :: Error fetching address`, err)
  }
}

interface WeatherData {
  temp: { min: number; max: number }
  humidity: number
  wind_speed: number
  sunrise: number
  sunset: number
  moonrise: number
  moonset: number
  weather: { description: string }[]
}

const writeWeatherData = async (
  { currentDay, address }: { currentDay: WeatherData; address: any },
  srcBlock: BlockIdentity
) => {
  const {
    temp: { min, max },
    humidity,
    wind_speed,
    sunrise,
    sunset,
    moonrise,
    moonset,
    weather = [],
  } = currentDay

  await logseq.Editor.insertBatchBlock(srcBlock, [
    {
      content: '[[Daily Weather]]',
      children: [
        {
          content: `forecast:: ${weather
            .map(({ description }) => description)
            .join(', ')}`,
        },
        {
          content: `temperature:: ${Math.floor(min)}℉ / ${Math.floor(max)}℉`,
        },
        {
          content: `humidity:: ${humidity}%`,
        },
        {
          content: `wind:: ${Math.floor(wind_speed)} mph`,
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
          content: `location:: [[${getCity(address)}]], [[${getState(
            address
          )}]]`,
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
      // TODO
      await doIt(e)
    }
  )
}

logseq.ready(main).catch(console.error)
