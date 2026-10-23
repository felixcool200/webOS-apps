# Departures

A fullscreen departure board for a rooted LG webOS TV. It shows the next real-time departures from three SL stops near home:

| Column | SL site id | Filter |
| --- | --- | --- |
| Torsvikstorg | 2000 | `BUS` |
| Torsvik (Lidingöbanan) | 9252 | `TRAM` |
| Ropsten | 9220 | `METRO` |

Each row shows the line, the destination and the minutes until departure. Cancelled departures stay in the list, marked as cancelled. SL service notices for the column's mode appear at the bottom of the column.

The app polls every 30 seconds while it is in the foreground and recounts the minutes every 5 seconds between polls. Press OK to refresh immediately and Back to close.

## Data source

Departures come from the [SL Transport API](https://www.trafiklab.se/api/other-apis/sl/transport/) on Trafiklab:

```text
GET https://transport.integration.sl.se/v1/sites/{siteId}/departures?transport=BUS&forecast=120
```

The API needs no key and sends `Access-Control-Allow-Origin: *`, so the app calls it directly without the root exec service. Site ids come from `https://transport.integration.sl.se/v1/sites`. They are not the ids used by SL Stop Lookup. Two sites are named Ropsten; 9220 is the one in Stockholm.

The API returns at most three departures per line and direction. The Ropsten column therefore never shows more than three metro departures.

SL timestamps are Stockholm local time without an offset. The app converts the current time to Europe/Stockholm before comparing, so the countdown does not depend on the TV's time zone setting.

To change the stops, edit `STOPS` in `app/app.js`.

## Build

```sh
npm install
npm run package
```

The packaged app is written to `dist/`.
