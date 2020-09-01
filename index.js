const express = require('express');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 8080;
const baseURL = process.env.ORDERS_HOST;
const key = process.env.API_KEY;
const interval = process.env.PULL_INTERVAL_MS || 2000;

const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('static'));

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/static/index.html`);
});

let storeName;

io.on('connection', (socket) => {
  console.log('user connected');

  let url = `${baseURL}/stores?key=${key}`;
  fetch(url).then((res) => res.json()).then((json) => {
    console.log('fetched stores from', url);
    socket.emit('connected', json);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  socket.on('get geofences', (msg) => {
    storeName = msg; // This is a side effect. Sets storeName as a global upon getting geofences. Fix this with a better approach.
    socket.join(`orders/${storeName}`); // join the client to the orders for this store
    url = `${baseURL}/geofences?storeName=${storeName}&key=${key}`;
    fetch(url).then((res) => res.json()).then((json) => {
      console.log('fetched geofences from', url);
      socket.emit('geofences', json);
    });
  });

  socket.on('close order', (msg) => {
    url = `${baseURL}/orders/${msg.orderId}?key=${key}`;
    const options = {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: ['closed'],
        storeName: msg.storeName,
      }),
    };
    fetch(url, options).then((res) => res).then((res) => {
      // check for a 204, ideally
      console.log('closed order at', url);
      socket.emit('closed', msg);
    });
  });
});

// emits orders to all connected sockets
function pullOrders() {
  const url = `${baseURL}/orders?storeName=${storeName}&status=open&key=${key}`;
  fetch(url).then((res) => res.json()).then((json) => {
    io.to(`orders/${storeName}`).emit('orders', json);
  });
}

setInterval(pullOrders, interval);

http.listen(port, () => {
  console.log(`socker server listening on *:${port}`);
});
