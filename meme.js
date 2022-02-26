const cheerio = require("cheerio");
const axios = require("axios").default;

require("dotenv").config();

const baseUrl = "https://imgflip.com";

module.exports = {
  // fetchMeme: async (searchText) => {
  //   try {
  //     const url = "https://imgflip.com/search?q=" + searchText;
  //     const browser =
  //       process.env.APP_ENVIRONMENT == "PROD"
  //         ? await puppeteer.launch({ args: ["--no-sandbox"] })
  //         : await puppeteer.launch({ headless: true });
  //     const page = await browser.newPage();
  //     await page.goto(url);
  //     await page.click("#s-results > a:nth-child(2)");
  //     await new Promise((r) => setTimeout(r, 1000));
  //     let memeExists =
  //       (await page.$(
  //         "#base-left > div:nth-child(1) > div.base-img-wrap-wrap > div > a > img"
  //       )) || null;
  //     if (memeExists) {
  //       await page.click(
  //         "#base-left > div:nth-child(1) > div.base-img-wrap-wrap > div > a"
  //       );
  //       await new Promise((r) => setTimeout(r, 2000));
  //       const issueSrc = await page.evaluate(() => {
  //         const image = document.querySelector("#im");
  //         return image.getAttribute("src");
  //       });
  //       await browser.close();
  //       return issueSrc;
  //     } else {
  //       await page.click("#base-right > div > a.meme-link");
  //       await new Promise((r) => setTimeout(r, 2000));
  //       const issueSrc = await page.evaluate(() => {
  //         const image = document.querySelector("#mtm-img");
  //         return image.getAttribute("src");
  //       });
  //       await browser.close();
  //       return issueSrc;
  //     }
  //   } catch (err) {
  //     console.error(err);
  //     return null;
  //   }
  // },
  // fetchMemeTemplate: async (searchText) => {
  //   try {
  //     const url = "https://imgflip.com/search?q=" + searchText;
  //     const browser =
  //       process.env.APP_ENVIRONMENT == "PROD"
  //         ? await puppeteer.launch({ args: ["--no-sandbox"] })
  //         : await puppeteer.launch({ headless: true });
  //     const page = await browser.newPage();
  //     await page.goto(url);
  //     await page.click("#s-results > a:nth-child(2)");
  //     await new Promise((r) => setTimeout(r, 1000));
  //     await page.click("#base-right > div > a.meme-link");
  //     await new Promise((r) => setTimeout(r, 2000));
  //     const issueSrc = await page.evaluate(() => {
  //       const image = document.querySelector("#mtm-img");
  //       return image.getAttribute("src");
  //     });
  //     const templateId = await page.evaluate(() => {
  //       const para = document.querySelector("#mtm-info > p");
  //       // const para = document.querySelector("#mtm-info > p");
  //       if (!!para.innerText && para.innerText.startsWith("Template ID")) {
  //         return para.innerText.split(" ")[2];
  //       } else {
  //         return null;
  //       }
  //     });
  //     await browser.close();
  //     return { image: issueSrc, id: templateId };
  //   } catch (err) {
  //     console.error(err);
  //     return { image: null, id: null };
  //   }
  // },

  fetchMeme: async (searchText) => {
    try {
      // Fetch the page
      let url = baseUrl + "/search?q=" + searchText;

      const response = await axios.get(url);

      let $ = cheerio.load(response.data);

      // Find the first meme
      // const meme = $("#s-results > a:nth-child(2)");

      const memes = $(".clearfix");

      console.log("Found memes: ", memes.length);

      let imageSrcs = [];
      let top10 = 10;

      for (let meme of memes) {
        // console.log(meme);

        try {
          // If the meme exists, click it
          if (meme && $(meme).attr("href") && top10 > 0) {
            // console.log(meme);

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

                imageSrcs.push(imageSrc);

                top10--;
              } else {
                const templateLink = $("#base-right > div > a.meme-link");

                console.log("meme link ", $(meme).attr("href"));
                console.log("template link: ", templateLink.attr("href"));

                url = baseUrl + templateLink.attr("href");

                const response = await axios.get(url);

                $ = cheerio.load(response.data);

                const imageSrc = $("#mtm-img").attr("src");

                imageSrcs.push(imageSrc);

                top10--;
              }
            } else if (memeUrl.includes("/i/")) {
              url = baseUrl + $(meme).attr("href");

              const response = await axios.get(url);

              $ = cheerio.load(response.data);

              const imageSrc = $("#im").attr("src");

              imageSrcs.push(imageSrc);

              top10--;
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
      const meme = $("#s-results > a:nth-child(2)");

      // If the meme exists, click it
      if (meme && meme.attr("href")) {
        url = baseUrl + meme.attr("href");

        let res = await axios.get(url);

        $ = cheerio.load(res.data);

        const templateLink = $("#base-right > div > a.meme-link");

        url = baseUrl + templateLink.attr("href");

        const response = await axios.get(url);

        $ = cheerio.load(response.data);

        const imageSrc = $("#mtm-img").attr("src");

        const templateId = $("#mtm-info > p").first().text().split(" ")[2];

        return { image: imageSrc, id: templateId };
      } else {
        console.log("meme template does not exist");
        return { image: null, id: null };
      }
    } catch (err) {
      console.error(err);
      return { image: null, id: null };
    }
  },
};
