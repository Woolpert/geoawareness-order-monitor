# Order Monitor

Order Monitor is a web application (NodeJS) consisting of a near real-time dashboard of customer locations along with their ETAs. The dashboard includes both a map and order queue.

## Prerequisites

Perform the following steps inside your Google Cloud Project using [Cloud Console](https://console.cloud.google.com).

1. Create a new Map Id and associated style. Follow these [instructions](https://developers.google.com/maps/documentation/javascript/cloud-based-map-styling).
1. Create a Maps API key. This API key will be used to authenticate the application with the Maps JavaScript API.
1. Create a GeoAwareness API key. This API key will be used to authenticate the Order Monitor web server (backend) with the GeoAwareness REST API.

Make sure to follow API key best practices, including [Securing an API key](https://cloud.google.com/docs/authentication/api-keys#securing_an_api_key).

## Configure client-side application

Edit the client-side app config file `static/config/config.json`.

- `mapsKey` must have permissions for [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/overview).
- add the Map Id created in the prerequisites to `mapIds`.

## Run Locally

1. Install the version of node that is in `.nvmrc` (optionally use NVM to manage your NodeJS installs)

1. Clone this repo

1. Install the server

   ```
   npm install
   ```

1. Create a `.env` file at the root and set the following keys:

   ```
   PORT=5000 # optional, defaults to 8080
   ORDERS_HOST="GEOAWARENESS_REST_API_ENDPOINT"
   API_KEY="YOUR_API_KEY"
   PULL_INTERVAL_MS=2000 # optional
   ```

1. Start the server...

   ```
   npm run dev
   ```

1. Open the site in the browser: http://localhost:5000

## Application design and code structure

- Server code: `index.js`
- Client HTML: `static/index.html` and uses Mustache for inline HTML templating
- Client code: `static/app.js` uses plain JavaScript
- Client UX is done with [Material Design Bootstrap](https://mdbootstrap.com/docs/)
- Most everything else in `static` is from the bootstrap install.

The browser and server both use [socket.io](https://socket.io/) to communicate over WebSockets for a realtime feed of orders.

## Deploy to GCP

Configure the server-side application by editing `app.yaml` environment variables. `API_KEY` must have permissions for the GeoAwareness REST API.

```
env_variables:
   ORDERS_HOST: "GEOAWARENESS_REST_API_ENDPOINT"
   API_KEY: "YOUR_API_KEY"
   PULL_INTERVAL_MS: 2000 # optional
```

Deploy to AppEngine

```
gcloud app deploy app.yaml
```

Launch the application. Browse to:

    https://<YOUR_PROJECT_ID>.wm.r.appspot.com # Eg. https://geoawareness-sandbox.wm.r.appspot.com
