import { chooseMove } from './ai.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, action: chooseMove(data.state, data.options) }); }
  catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
