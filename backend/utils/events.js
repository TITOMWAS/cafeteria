// Tiny event bus used to push live order updates to connected SSE clients.
const { EventEmitter } = require('events');

const orderEvents = new EventEmitter();
orderEvents.setMaxListeners(100);

const emitOrderEvent = (event, payload) => {
  orderEvents.emit('order', { event, payload, at: new Date().toISOString() });
};

module.exports = { orderEvents, emitOrderEvent };
