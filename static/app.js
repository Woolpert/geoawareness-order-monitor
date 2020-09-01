const socket = io();

//
//
// Globals
//
//

let map = null;
const stores = [];
let geofencesLayer;
const geofenceColorRamp = {
  600: '#bbdefb',
  300: '#2196f3',
  120: '#0d47a1',
};

let ordersLayer;
const orderGroups = [
  {
    minutes: '2',
    range: 120,
    color: geofenceColorRamp[120],
    orders: [],
  },
  {
    minutes: '5',
    range: 300,
    color: geofenceColorRamp[300],
    orders: [],
  },
  {
    minutes: '10',
    range: 600,
    color: geofenceColorRamp[600],
    orders: [],
  },
  {
    minutes: '>10',
    range: 601,
    color: 'grey',
    orders: [],
  },
];

//
//
// UI Events
//
//

function renderStore(store) {
  const template = document.getElementById('store-template').innerHTML;
  const rendered = Mustache.render(template, { store: store });
  document.getElementById('stores').innerHTML += rendered;

  const marker = new google.maps.Marker({
    position: {
      lat: store.location.latitude,
      lng: store.location.longitude,
    },
    map,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: '#0d47a1',
      fillOpacity: 0.9,
      strokeWeight: 0,
    },
  });
  marker.addListener('click', () => {
    onGetOrders(store.name);
  });
}

function onGetOrders(storeName) {
  const store = stores.find(store => store.name === storeName);
  console.log('Getting orders for', store.name);
  socket.emit('get geofences', store.name);

  document.getElementById('store-page-header').innerHTML = '';
  document.getElementById('stores').innerHTML = '';
  // render store page header
  const template = document.getElementById('store-page-header-template').innerHTML;
  const rendered = Mustache.render(template, { store: store });
  document.getElementById('store-page-header').innerHTML += rendered;

  map.setCenter(new google.maps.LatLng(store.location.latitude, store.location.longitude));
  map.setZoom(11);
}

function onNavRange(range) {
  onShowRange(range);
  // move scrollbar down to order group...
}

function onNavStores(id) {
  socket.emit('get orders', id);
  setExtentToStores();
}

function onHoverOrder(id) {
  ordersLayer.revertStyle();
  const feature = ordersLayer.getFeatureById(id);
  if (feature) {
    ordersLayer.overrideStyle(feature, {
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: '#bf360c',
        fillOpacity: 0.9,
        strokeColor: '#fcfda1',
        strokeWeight: 3.0,
      }
    });
  }
}

function onHoverOrderGroup(id) {
  geofencesLayer.revertStyle();
  const feature = geofencesLayer.getFeatureById(id);
  if (feature) {
    geofencesLayer.overrideStyle(feature, {
      fillColor: '#fcfda1',
    });
  }
}

function onShowRange(range) {
  // recenter the map to geofence extents
  let geofence = geofencesLayer.getFeatureById(range);
  if (!geofence) {
    geofence = geofencesLayer.getFeatureById(600);
  }
  const bounds = new google.maps.LatLngBounds();
  geofence.getGeometry().forEachLatLng((latlng) => {
    bounds.extend(latlng);
  });
  map.fitBounds(bounds);
}

function onCloseOrder(orderId, storeName) {
  socket.emit('close order', { orderId, storeName });
}

//
//
// Scocket.IO Events
//
//
socket.on('connected', (msg) => {
  console.log('Client connected via socket.io', msg);
  if (stores.length > 0) {
    return;
  }
  document.getElementById('stores').innerHTML = '';
  msg.forEach((element) => {
    stores.push(element);
    renderStore(element);
  });

  setExtentToStores();
});

socket.on('orders', (msg) => {
  console.log('orders', msg);
  let orders = msg;
  orders = orders.filter(order => order.latestEvent);
  if (orders == null || orders.length === 0) {
    console.log('No orders with latest events.');
  }

  // clear out existing orders and data
  const previousOrders = [];
  orderGroups.forEach((group) => {
    group.orders.forEach((item) => {
      previousOrders.push(item);
    });
    group.orders = [];
  });
  ordersLayer.forEach(feature => ordersLayer.remove(feature));
  ordersLayer.setMap(null);

  // show the order locations on the map
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    if (!order.latestEvent.innerGeofence) {
      orderGroups[3].orders.push(order);
      continue;
    }
    switch (order.latestEvent.innerGeofence.range) {
      case 120:
        orderGroups[0].orders.push(order);
        break;
      case 300:
        orderGroups[1].orders.push(order);
        break;
      case 600:
        orderGroups[2].orders.push(order);
        break;
      default:
        orderGroups[3].orders.push(order);
    }
  }

  // sort orders by most recently received
  orderGroups.forEach((group) => {
    group.orders.sort((a, b) => {
      const aDate = new Date(a.latestEvent.eventTimestamp * 1000);
      const bDate = new Date(b.latestEvent.eventTimestamp * 1000);
      return aDate - bDate;
    });
  });

  // render the geofence grouping headers
  document.getElementById('stores').innerHTML = '';
  orderGroups.forEach((group) => {
    const template = document.getElementById('order-group-template').innerHTML;
    const rendered = Mustache.render(template, {
      range: {
        id: group.range,
        color: group.color,
        time: group.minutes,
      },
    });
    document.getElementById('stores').innerHTML += rendered;
  });

  orderGroups.forEach((group) => {
    // indicate no orders for this geofence range
    let emptyGroup = true;
    group.orders.forEach((order) => {
      if (!order.status.includes('closed')) {
        emptyGroup = false;
      }
    });
    if (emptyGroup) {
      const template = document.getElementById('order-empty-template').innerHTML;
      const rendered = Mustache.render(template);
      document.getElementById(`range-${group.range}`).innerHTML += rendered;
    }

    // render each order
    const openOrders = group.orders.filter(order => !order.status.includes('closed'));
    openOrders.forEach(order => {
      // reformat absolute timestamp to an age (seconds ago, minutes ago)
      const lastPing = new Date(order.latestEvent.eventTimestamp * 1000);
      const secondsAgo = (new Date() - lastPing) / 1000;
      if (secondsAgo < 5) {
        order.date = 'now';
      } else if (secondsAgo / 60 < 1) {
        order.date = Math.round(secondsAgo) + ' sec ago';
      } else if (secondsAgo / 3600 < 1) {
        order.date = (secondsAgo / 60).toFixed(1) + ' min ago';
      } else {
        order.date = (secondsAgo / 3600).toFixed(1) + ' hrs ago';
      }

      // add order to map
      const orderLocation = {
        lat: order.latestEvent.eventLocation.latitude,
        lng: order.latestEvent.eventLocation.longitude,
      };
      const feature = new google.maps.Data.Feature({ geometry: orderLocation, id: order.orderId });
      ordersLayer.add(feature);

      // render the order card
      const template = document.getElementById('order-template').innerHTML;
      const rendered = Mustache.render(template, { order: order });
      document.getElementById(`range-${group.range}`).innerHTML += rendered;

      // alert the user as the order enters the innermost geofence
      previousOrders.forEach((previousOrder) => {
        if (previousOrder.orderId === order.orderId
          && previousOrder.latestEvent && previousOrder.latestEvent.innerGeofence
          && previousOrder.latestEvent.innerGeofence.range === 300
          && group.range === 120) {
          // callback function for flashing the order
          alertOrder((count, orderId) => {
            const orderElement = document.getElementById(`order-${orderId}`);
            if (count % 2 === 0) {
              orderElement.classList.add('flash');
            } else {
              orderElement.classList.remove('flash');
            }
          }, 400, 15, previousOrder.orderId); // ms delay, how many times, order id
        }
      });
    });
    ordersLayer.setMap(map);
  });
});

socket.on('geofences', (msg) => {
  const geofences = msg;
  geofencesLayer.forEach(feature => geofencesLayer.remove(feature));
  geofencesLayer.setMap(null);

  if (!geofences || !geofences.length) {
    return;
  }
  console.log('geofences', geofences);
  const bounds = new google.maps.LatLngBounds();
  geofences.reverse(); // assume API returns outermost geofence at index 0

  geofencesLayer.setMap(map);
  for (let i = 0; i < geofences.length; i++) {
    let { shape: geofenceRing } = geofences[i];
    if (i < geofences.length - 1) {
      geofenceRing = turf.difference(geofences[i].shape, geofences[i + 1].shape);
    }
    const feature = geofencesLayer.addGeoJson(geofenceRing, { idPropertyName: 'value' })[0];
    feature.getGeometry().forEachLatLng((latlng) => {
      bounds.extend(latlng);
    });
  }
  map.fitBounds(bounds);
});

socket.on('closed', (msg) => {
  // nothing to do on the client
  console.log('I closed', msg);
});

//
//
// Helper Functions
//
//

function loadMap() {
  const location = new google.maps.LatLng(1, 1);

  const options = {
    center: location,
    zoom: 0,
    mapId: window.config.mapIds,
    gestureHandling: 'greedy', // disable the stupid default CTRL required to zoom
  };

  map = new google.maps.Map(document.getElementById('map-container'), options);

  geofencesLayer = new google.maps.Data();
  geofencesLayer.setStyle((feature) => {
    return {
      fillColor: geofenceColorRamp[feature.getId()],
      strokeWeight: 0.1
    }
  });

  ordersLayer = new google.maps.Data();
  ordersLayer.setStyle((feature) => {
    return {
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 5,
        fillColor: '#bf360c',
        fillOpacity: 0.9,
        strokeColor: '#ffffff',
        strokeWeight: 0.5,
      }
    };
  });
}

function setExtentToStores() {
  const bounds = new google.maps.LatLngBounds();
  stores.forEach((store) => {
    const latlng = new google.maps.LatLng(store.location.latitude, store.location.longitude);
    bounds.extend(latlng);
  });
  map.fitBounds(bounds);
}

function alertOrder(callback, delay, reps, orderId) {
  let x = 0;
  const intervalId = window.setInterval(() => {
    callback(x, orderId);
    if (++x === reps) {
      window.clearInterval(intervalId);
    }
  }, delay);
}

const getConfig = () => {
  return fetch('./config/config.json')
    .then(response => response.json())
    .then(data => {
      return data;
    });
}

const addGMapsScript = () => {
  var script = document.createElement("script");
  script.src =
    "https://maps.googleapis.com/maps/api/js?" +
    "v=weekly" +
    "libraries=geometry&" +
    `key=${window.config.mapsKey}&` +
    "callback=loadMap&" +
    `map_ids=${window.config.mapIds}`;
  script.defer = true;
  script.async = true;
  document.head.appendChild(script);
}

getConfig().then(config => {
  window.config = config;
  addGMapsScript();
});