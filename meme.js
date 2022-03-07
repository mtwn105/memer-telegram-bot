const cheerio = require("cheerio");
const axios = require("axios").default;

require("dotenv").config();

const baseUrl = "https://imgflip.com";

module.exports = {
  fetchMeme: async (searchText) => {
    try {
      // Fetch the page
      let url = baseUrl + "/search?q=" + searchText;

      const response = await axios.get(url);

      let $ = cheerio.load(response.data);

      // Find the first meme

      const memes = $(".clearfix");

      console.log("Found memes: ", memes.length);

      let imageSrcs = [];
      let top10 = 10;

      for (let meme of memes) {
        try {
          // If the meme exists, click it
          if (meme && $(meme).attr("href") && top10 > 0) {
            const memeUrl = $(meme).attr("href");

            if (memeUrl.includes("/meme/")) {
              url = baseUrl + $(meme).attr("href");

              const response = await axios.get(url);

              $ = cheerio.load(response.data);

              const imgLink = $(
                "#base-left > div:nth-child(1) > div.base-img-wrap-wrap > div > a"
              );

              if (imgLink && imgLink.attr("href")) {
                console.log("meme exists");

                url = baseUrl + imgLink.attr("href");

                const response = await axios.get(url);

                $ = cheerio.load(response.data);

                const imageSrc = $("#im").attr("src");

                if (imageSrc) {
                  imageSrcs.push(imageSrc);

                  top10--;
                }
              } else {
                const templateLink = $("#base-right > div > a.meme-link");

                console.log("meme link ", $(meme).attr("href"));
                console.log("template link: ", templateLink.attr("href"));

                url = baseUrl + templateLink.attr("href");

                const response = await axios.get(url);

                $ = cheerio.load(response.data);

                const imageSrc = $("#mtm-img").attr("src");

                if (imageSrc) {
                  imageSrcs.push(imageSrc);

                  top10--;
                }
              }
            } else if (memeUrl.includes("/i/")) {
              url = baseUrl + $(meme).attr("href");

              const response = await axios.get(url);

              $ = cheerio.load(response.data);

              const imageSrc = $("#im").attr("src");

              if (imageSrc) {
                imageSrcs.push(imageSrc);

                top10--;
              }
            } else {
              console.log("meme does not exist");
            }
          }
        } catch (err) {
          console.log("Error fetching this meme for ", meme);
          console.log(err);
        }
      }

      console.log("imageSrcs: ", imageSrcs);

      return imageSrcs;
    } catch (err) {
      console.error(err);
      return null;
    }
  },

  fetchMemeTemplate: async (searchText) => {
    try {
      // Fetch the page
      let url = baseUrl + "/search?q=" + searchText;

      let response = await axios.get(url);

      let $ = cheerio.load(response.data);

      // Find the first meme

      const memes = $(".clearfix");

      console.log("Found memes: ", memes.length);

      let imageSrcs = [];
      let top10 = 10;

      for (let meme of memes) {
        // If the meme exists, click it
        if (
          meme &&
          $(meme).attr("href") &&
          $(meme).attr("href").includes("/meme/") &&
          top10 > 0
        ) {
          url = baseUrl + $(meme).attr("href");

          let res = await axios.get(url);

          $ = cheerio.load(res.data);

          const templateLink = $("#base-right > div > a.meme-link");

          url = baseUrl + templateLink.attr("href");

          const response = await axios.get(url);

          $ = cheerio.load(response.data);

          const imageSrc = $("#mtm-img").attr("src");

          const templateId = $("#mtm-info > p").first().text().split(" ")[2];

          if (imageSrc && templateId) {
            imageSrcs.push({ image: imageSrc, id: templateId });

            top10--;
          }
        } else {
          console.log("meme template does not exist");
        }
      }

      console.log("imageSrcs: ", imageSrcs);

      return imageSrcs;
    } catch (err) {
      console.error(err);
      return { image: null, id: null };
    }
  },
};
