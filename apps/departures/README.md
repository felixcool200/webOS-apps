# Departures

A fullscreen departure board for a rooted LG webOS TV. It shows the next real-time departures from three SL stops near home:

| Column | SL site id | Filter |
| --- | --- | --- |
| Torsvikstorg | 2000 | `BUS` |
| Torsvik (Lidingöbanan) | 9252 | `TRAM` |
| Ropsten | 9220 | `METRO` |

The bus and tram columns are split in half: "From Lidingö" (towards Ropsten) on top and "To Lidingö" below.

- **Torsvikstorg** splits by side of the road. The top half is the Ropsten side: every bus to Ropsten (SL stop point 20022, Trafiklab platform 2) and 238 to Högsätra (20024, platform 3). Everything else, including 238 to Näset, leaves from the other side.
- **Torsvik** splits by direction: SL's `direction` field starting with "Ropsten" goes on top. Both tram platforms can serve both directions, so the platform is not a reliable signal.
- **Ropsten** is not split. All metro departures from Ropsten leave in the same direction.

Each row shows the line, the destination and the minutes until departure. Cancelled departures stay in the list, marked as cancelled. SL service notices for the column's mode appear at the bottom of the column.

The app counts down from the TV clock between refreshes. Departures within ten minutes show minutes and seconds (`4:32`), the last minute shows seconds (`45 s`).

| Key | Action |
| --- | --- |
| OK | Refresh both sources now |
| Up / Down | Ask Trafiklab more or less often, in 15 s steps from 90 s (60 s to 10 min, remembered on the TV) |
| Back | Close |

## Data sources

The app polls two APIs while it is in the foreground and uses whichever has data for each stop.

**[Trafiklab Realtime API](https://www.trafiklab.se/api/our-apis/trafiklab-realtime-apis/timetables/)** is preferred. It returns every departure in the next 60 minutes with a `canceled` flag, so the metro shows more than three trains. It needs an API key and caches answers for 60 seconds.

```text
GET https://realtime-api.trafiklab.se/v1/departures/{areaId}?key={key}
```

Area ids come from `https://realtime-api.trafiklab.se/v1/stops/name/{name}?key={key}`: Torsvikstorg 740045933, Lidingö Torsvik station 740024788, Ropsten T-bana 740020757. The default interval of 90 seconds keeps three stops at 86,400 requests in 30 days even if the TV shows the app nonstop, under the 100,000 a month of a Bronze key.

Both APIs come from Trafiklab under CC-BY, which asks for a "data from Trafiklab.se" credit on screen; the header says "Live SL data from Trafiklab.se". Asking Trafiklab more often than every 60 seconds brings nothing new: its answers carry `cache-control: max-age=60`, and in October 2026 requests 15, 30 and 45 seconds after the first got the same answer back.

**[SL Transport API](https://www.trafiklab.se/api/other-apis/sl/transport/)** is polled every 30 seconds. It needs no key and is the only source of the stop notices. Its departures are used when there is no Trafiklab key, when Trafiklab fails or has no departures for a stop, or when Trafiklab data has missed more than one refresh. The status line then says "SL data for …" and, when Trafiklab failed, why.

```text
GET https://transport.integration.sl.se/v1/sites/{siteId}/departures?transport=BUS&forecast=120
```

Site ids come from `https://transport.integration.sl.se/v1/sites`. Two sites are named Ropsten; 9220 is the one in Stockholm. The API returns at most three departures per line and direction, so the metro falls back to three trains.

SL sometimes answers with an empty list for a stop that has traffic. An empty answer only replaces departures that are more than two minutes old.

Both APIs send `Access-Control-Allow-Origin: *`, so the app calls them directly without the root exec service. Both give Stockholm local times without an offset. The app converts the current time to Europe/Stockholm before comparing, so the countdown does not depend on the TV's time zone setting.

To change the stops, edit `STOPS` in `app/app.js`. Each stop needs both its SL site id and its Trafiklab area id.

## API key

Add the key from a Trafiklab project with **Trafiklab Realtime APIs** to the repository's `.env`:

```sh
TRAFIKLAB_KEY=...
```

`npm run build` (and so `npm run package`) runs `scripts/write-config.js`, which adds the key to the front of the built `build/app.js`. `build/` is gitignored. Without a key the app uses SL only.

An IPK built with a key contains it, so do not publish that IPK.

## Build

```sh
npm install
npm run package
```

The packaged app is written to `dist/`.
