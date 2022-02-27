const axios = require("axios").default;

const apiUrl = "https://api.graphjson.com/api/log";

module.exports = {
  sendLogs: async (event, collection) => {
    const payload = {
      api_key: process.env.GRAPH_JSON_API_KEY,
      collection: collection,
      json: JSON.stringify(event),
      timestamp: Math.floor(new Date().getTime() / 1000),
    };

    try {
      axios.post(apiUrl, payload).catch((err) => {
        console.log("Error while sending log", err);
      });
    } catch (error) {
      console.log("Error while sending log", err);
    }
  },
};
