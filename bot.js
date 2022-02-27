const axios = require("axios").default;
const fs = require("fs");
const FormData = require("form-data");
const request = require("request");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const TeleBot = require("telebot");

const { fetchMeme, fetchMemeTemplate } = require("./meme");
const { sendLogs } = require("./log");
const { connectToRedis } = require("./redis");
const { cleanUpImages } = require("./utils");

require("dotenv").config();

// Created bot object
const bot = new TeleBot({
  token: process.env.TELEGRAM_KEY, // Required. Telegram Bot API token.
  webhook: {
    url: process.env.APP_URL + "/bot", // HTTPS url to send updates to.
  },
  // allowedUpdates: [], // Optional. List the types of updates you want your bot to receive. Specify an empty list to receive all updates.
  // usePlugins: ["askUser"], // Optional. Use user plugins from pluginFolder.
  // pluginFolder: "../plugins/", // Optional. Plugin folder location.
  // pluginConfig: {
  //   // Optional. Plugin configuration.
  //   // myPluginName: {
  //   //   data: 'my custom value'
  //   // }
  // },
});

let client = null;

const url = "https://api.imgflip.com/caption_image";

const app = express();

const port = process.env.PORT || 3000;

// parse the updates to JSON
app.use(express.json());

app.use(cors());
app.use(helmet());
app.use(morgan("combined"));

// We are receiving updates at the route below!
app.post(`/bot/${process.env.TELEGRAM_KEY}`, (req, res) => {
  bot.receiveUpdates([req.body]);

  // bot.receiveUpdates(req.body);
  res.status(200).send("ok");
});

// Start Express Server
app.listen(port, async () => {
  console.log(`Memer bot server is listening on ${port}`);
  client = await connectToRedis();
  setInterval(() => cleanUpImages(), 300000);
});

bot.on("error", (err) => {
  console.log("Some error occured", err);
});

// Admin Message
bot.on(/\/message (.+)/, async (msg, props) => {
  console.log(props);

  const message = props.match[1];

  if (msg.chat.id == process.env.MY_CHAT_ID && message) {
    const text = message.substring(9);

    try {
      const keys = await client.keys("*");

      console.log("Sending message to ", keys.length, " people");

      let success = 0;

      for (const chatId of keys) {
        console.log("sending msg to", chatId);
        try {
          bot.sendMessage(chatId, text);
          success++;
        } catch (err) {
          console.log("Error while sending message", err);
        }
      }

      console.log(
        "Successfully sent message to ",
        success + "/" + keys.length + " people"
      );

      bot.sendMessage(
        process.env.MY_CHAT_ID,
        "Successfully sent message to " +
          success +
          "/" +
          keys.length +
          " people"
      );
    } catch (err) {
      console.log("Error while sending message");
      bot.sendMessage(msg.chat.id, "Error while sending message ");
      return;
    }
  }
});

// Start
bot.on(/\/start/, async (msg) => {
  bot.sendMessage(msg.chat.id, "Welcome to Memer Bot");
  bot.sendMessage(
    msg.chat.id,
    `Hey there ${msg.from.first_name}, I am Memer Bot!

  You can search & create memes using the following commands:

  /search <phrase> - Search for a meme for a word/phrase
  /create - Create a meme from a template or custom image
  /reset - Reset the current state of the bot (if not responding)
  `
  );
  await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));

  // Send Logs
  sendLogs(
    {
      Event: "Welcome",
      User: msg.chat.username,
    },
    "memer_welcome"
  );
});

// Reply to hey, hi, hello
bot.on(/^hi$|^hey$|^hello$/i, async (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `Hey there ${msg.from.first_name}, I am Memer Bot!

  You can search & create memes using the following commands:

  /search <search-term> - Search for a meme for a term
  /create - Create a meme from a template or custom image
  /reset - Reset the current state of the bot (if not responding)
  `
  );
  await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));

  // Send Logs
  sendLogs(
    {
      Event: "Welcome",
      User: msg.chat.username,
    },
    "memer_welcome"
  );
});

// Reset states
bot.on(/\/reset/, async (msg) => {
  await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));
  bot.sendMessage(
    msg.chat.id,
    "Resetted state. Now you can try searching or creating memes again"
  );
});

// Search error
bot.on(/^\/search$/, async (msg) => {
  await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));
  bot.sendMessage(msg.chat.id, "Send search term like /search <search-term>");
});

// Search
bot.on(/^\/search (.+)$/, async (msg, props) => {
  await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));

  console.log({ props });

  const text = props.match[0];

  if (text) {
    const searchText = text.substring(7);

    // Send Logs
    sendLogs(
      {
        Event: "Search Meme Request",
        Search: searchText,
        User: msg.chat.username,
      },
      "memer_search"
    );

    console.log("searchText", searchText);

    bot.sendMessage(msg.chat.id, "Seaching meme for you...");

    let memeSrcs = await fetchMeme(searchText);

    if (memeSrcs && memeSrcs.length > 0) {
      console.log("Got Search " + memeSrcs);

      bot.sendMessage(
        msg.chat.id,
        `${msg.from.first_name}, Here are some top memes I found 👇`
      );

      memeSrcs.forEach((memeSrc) => {
        if (memeSrc.substring(0, 2) === "//") {
          memeSrc = "http://" + memeSrc.substring(2);
        } else {
          memeSrc = "https://imgflip.com" + memeSrc;
        }

        bot.sendPhoto(msg.chat.id, memeSrc);
      });

      // Send Logs
      sendLogs(
        {
          Event: "Search Meme Processed",
          Search: searchText,
          Status: "Success",
          User: msg.chat.username,
        },
        "memer_search"
      );
    } else {
      bot.sendMessage(
        msg.chat.id,
        "Sorry " + msg.from.first_name + ", I couldn't find a meme for you 😢"
      );
      // Send Logs
      sendLogs(
        {
          Event: "Search Meme Processed",
          Search: searchText,
          Status: "Error",
          User: msg.chat.username,
        },
        "memer_search"
      );
    }
  }
});

// Create
bot.on(/\/create/, async (msg) => {
  await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));

  bot.sendMessage(
    msg.chat.id,
    "Choose do you want to create a meme from a template or custom image",

    {
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: "Template",
              callback_data: "TEMPLATE_TYPE",
            },
            {
              text: "Custom Image",
              callback_data: "CUSTOM_TYPE",
            },
          ],
        ],
      },
    }
  );

  await client.set(msg.chat.id, JSON.stringify({ state: "CREATE_STARTED" }));
});

// Handle callback queries
bot.on("callbackQuery", async (callbackQuery) => {
  const action = callbackQuery.data;
  const msg = callbackQuery.message;

  console.log(action);

  if (action == "TEMPLATE_TYPE") {
    // Send Logs
    sendLogs(
      {
        Event: "Create Meme Started",
        Type: "Template",
        User: msg.chat.username,
      },
      "memer_create"
    );

    bot.sendMessage(
      msg.chat.id,
      "Please enter a search term to get a meme template"
    );

    await client.set(
      msg.chat.id,
      JSON.stringify({ state: "CREATE_TEMPLATE_SEARCH" })
    );
  } else if (action.includes("TEMPLATE_YES")) {
    let templateId = action.split(" ")[2];

    const chatDataString = await client.get(msg.chat.id);

    const chatData = chatDataString ? JSON.parse(chatDataString) : null;

    const tempMsgMap = chatData.tempMsgMap;

    if (
      tempMsgMap &&
      tempMsgMap.find((m) => m.templateId == templateId) &&
      tempMsgMap.find((m) => m.templateId == templateId).messageId
    ) {
      console.log("templateId", templateId);

      bot.sendMessage(msg.chat.id, "Great, You have a great choice!", {
        replyToMessage: tempMsgMap.find((m) => m.templateId == templateId)
          .messageId,
      });

      bot.sendMessage(msg.chat.id, "Please enter a top text (send . to skip)");
      await client.set(
        msg.chat.id,
        JSON.stringify({
          ...chatData,
          state: "CREATE_TEMPLATE_TOP",
          templateId: templateId,
        })
      );
    }
  } else if (action == "CUSTOM_TYPE") {
    // Send Logs
    sendLogs(
      {
        Event: "Create Meme Started",
        Type: "Custom",
        User: msg.chat.username,
      },
      "memer_create"
    );

    bot.sendMessage(
      msg.chat.id,
      "Please send me a photo to create a meme from"
    );

    await client.set(
      msg.chat.id,
      JSON.stringify({ state: "CREATE_CUSTOM_IMAGE_UPLOAD" })
    );
  }
});

// Handle create meme data
bot.on(/(.*)/, async (msg, props) => {
  try {
    const chatDataString = await client.get(msg.chat.id);
    const chatData = chatDataString ? JSON.parse(chatDataString) : null;

    if (chatData && chatData.state === "CREATE_TEMPLATE_SEARCH") {
      const searchText = props.match[0];

      console.log("searchText", searchText);

      bot.sendMessage(msg.chat.id, "Seaching meme template for you...");

      const memeTemplates = await fetchMemeTemplate(searchText);

      if (!!memeTemplates && memeTemplates.length > 0) {
        bot.sendMessage(
          msg.chat.id,
          `${msg.from.first_name}, Here are some meme templates from which you can choose 👇`
        );

        bot.sendMessage(
          msg.chat.id,
          `Select any one which you want to use by clicking "Select" button below each image`
        );

        const tempMsgMap = [];

        for (let memeTemplate of memeTemplates) {
          let { image, id } = memeTemplate;

          if (image && id) {
            console.log("Got Search " + image);
            if (image.substring(0, 2) === "//") {
              image = "http://" + image.substring(2);
            } else {
              image = "https://imgflip.com" + image;
            }

            const message = await bot.sendPhoto(msg.chat.id, image, {
              replyMarkup: {
                inline_keyboard: [
                  [
                    {
                      text: "Select",
                      callback_data: "TEMPLATE_YES ID: " + id,
                    },
                  ],
                ],
              },
            });

            console.log(message);

            if (message)
              tempMsgMap.push({
                templateId: id,
                messageId: message.message_id,
              });
          }
        }

        await client.set(
          msg.chat.id,
          JSON.stringify({ state: "CREATE_TEMPLATE_YES", tempMsgMap })
        );
      } else {
        bot.sendMessage(
          msg.chat.id,
          "Sorry " +
            msg.from.first_name +
            ", I couldn't find a meme template for you 😢. Please enter some other search term"
        );
      }
    } else if (chatData && chatData.state === "CREATE_TEMPLATE_TOP") {
      const text = props.match[0];

      console.log("topText", text);

      let topText = "";

      if (text === ".") {
      } else {
        topText = text;
      }
      bot.sendMessage(
        msg.chat.id,
        "Please enter a bottom text (send . to skip)"
      );

      await client.set(
        msg.chat.id,
        JSON.stringify({
          state: "CREATE_TEMPLATE_BOTTOM",
          templateId: chatData.templateId,
          topText: topText,
        })
      );
    } else if (chatData && chatData.state === "CREATE_TEMPLATE_BOTTOM") {
      const text = props.match[0];

      console.log("bottomText", text);

      let bottomText = "";

      if (text === ".") {
      } else {
        bottomText = text;
      }

      bot.sendMessage(
        msg.chat.id,
        `
      Top Text is ${
        chatData.topText === "" ? "None" : chatData.topText
      } \nBottom Text is ${bottomText === "" ? "None" : bottomText}
     `
      );

      // Generate meme
      const response = await axios.post(
        url,
        new URLSearchParams(
          {
            template_id: chatData.templateId,
            username: process.env.IMGFLIP_USERNAME,
            password: process.env.IMGFLIP_PASSWORD,
            text0: chatData.topText,
            text1: bottomText,
          },
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        )
      );

      if (
        response.status == 200 &&
        !!response.data &&
        response.data.success &&
        response.data.data.url
      ) {
        bot.sendMessage(msg.chat.id, `Here is your meme 👇`);
        bot.sendPhoto(msg.chat.id, response.data.data.url);

        await client.set(
          msg.chat.id,
          JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
        );

        // If you like it do share this bot with your friends
        // Also follow developer Amit Wani on Twitter @mtwn105
        bot.sendMessage(
          msg.chat.id,
          "Do you like this meme? Share it with your friends and follow me @mtwn105 on Twitter for more cool stuff 😉. If you want to support me, consider clicking the button below 👇",
          {
            replyMarkup: {
              inline_keyboard: [
                [
                  {
                    text: "@mtwn105",
                    url: "https://twitter.com/mtwn105",
                  },
                  {
                    text: "Support",
                    url: "https://rzp.io/l/dQtgHoQ6",
                  },
                ],
              ],
            },
          }
        );

        // Send Logs
        sendLogs(
          {
            Event: "Create Meme Processed",
            Status: "Success",
            Type: "Template",
            User: msg.chat.username,
          },
          "memer_create"
        );
      } else {
        console.log("Error occured while generating meme from meme template", {
          response,
        });

        bot.sendMessage(
          msg.chat.id,
          `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
        );

        await client.set(
          msg.chat.id,
          JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
        );

        // Send Logs
        sendLogs(
          {
            Event: "Create Meme Processed",
            Status: "Error",
            Type: "Template",
            User: msg.chat.username,
          },
          "memer_create"
        );
      }
    } else if (chatData && chatData.state === "CREATE_CUSTOM_IMAGE_TOP") {
      const text = props.match[0];

      console.log("topText", text);

      let topText = "";

      if (text === ".") {
      } else {
        topText = text;
      }
      bot.sendMessage(
        msg.chat.id,
        "Please enter a bottom text (send . to skip)"
      );

      await client.set(
        msg.chat.id,
        JSON.stringify({
          state: "CREATE_CUSTOM_IMAGE_BOTTOM",
          image: chatData.image,
          topText: topText,
        })
      );
    } else if (chatData && chatData.state === "CREATE_CUSTOM_IMAGE_BOTTOM") {
      const text = props.match[0];

      console.log("bottomText", text);

      let bottomText = "";

      if (text === ".") {
      } else {
        bottomText = text;
      }

      bot.sendMessage(
        msg.chat.id,
        `
      Top Text is ${
        chatData.topText === "" ? "None" : chatData.topText
      } \nBottom Text is ${bottomText === "" ? "None" : bottomText}
     `
      );

      bot.sendMessage(msg.chat.id, `Generating meme please wait...`);

      await generateCustomMeme(msg, bottomText);
    } else if (
      msg.text.includes("/start") &&
      msg.text.includes("/help") &&
      msg.text.includes("/search") &&
      msg.text.includes("/create") &&
      msg.text.includes("hi") &&
      msg.text.includes("hey") &&
      msg.text.includes("hello")
    ) {
      // await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));

      // Tell user I can't understand this and show help
      bot.sendMessage(
        msg.chat.id,
        "Sorry " +
          msg.from.first_name +
          ", I couldn't understand your message 😢. \n" +
          `You can search & create memes using the following commands:

  /search <search-term> - Search for a meme for a term
  /create - Create a meme from a template or custom image
  /reset - Reset the current state of the bot (if not responding)`
      );
    }
  } catch (err) {
    console.log("Error occurred ", err);

    bot.sendMessage(
      msg.chat.id,
      `Sorry ${msg.from.first_name}, There was some error & I couldn't help you 😢. Please try again 🥺`
    );
    await client.set(
      msg.chat.id,
      JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
    );

    // Send Logs
    sendLogs(
      {
        Event: "Create Meme Processed",
        Status: "Error",
        Type: "Custom",
        User: msg.chat.username,
      },
      "memer_create"
    );
  }
});

// Custom meme image upload handle
bot.on("photo", async (msg) => {
  const chatDataString = await client.get(msg.chat.id);
  const chatData = chatDataString ? JSON.parse(chatDataString) : null;

  if (chatData && chatData.state === "CREATE_CUSTOM_IMAGE_UPLOAD") {
    bot.sendMessage(msg.chat.id, "Awesome!, Looking good!");

    bot.sendMessage(msg.chat.id, "Please send me a top text (send . to skip)");

    await client.set(
      msg.chat.id,
      JSON.stringify({
        state: "CREATE_CUSTOM_IMAGE_TOP",
        image: msg.photo[msg.photo.length - 1].file_id,
      })
    );
  }
});

generateCustomMeme = async (msg, bottomText) => {
  let stream = null;

  try {
    const chatDataString = await client.get(msg.chat.id);
    const chatData = chatDataString ? JSON.parse(chatDataString) : null;

    // Get image
    const image = chatData.image;

    // Get image file from telegram using file_id
    const fileDetails = await bot.getFile(image);

    console.log("File Details", fileDetails);

    if (fileDetails && fileDetails.fileLink) {
      // Download image
      try {
        const res = await axios.get(fileDetails.fileLink, {
          responseType: "arraybuffer",
        });

        fs.writeFileSync(
          `./images/${fileDetails.file_unique_id}.jpg`,
          Buffer.from(res.data),
          "binary"
        );

        stream = fs.createReadStream(
          `./images/${fileDetails.file_unique_id}.jpg`
        );

        const uploadData = new FormData();
        uploadData.append("image", stream);
        uploadData.append("content-type", "application/octet-stream");

        const options = {
          method: "POST",
          url: "https://ronreiter-meme-generator.p.rapidapi.com/images",
          headers: {
            "x-rapidapi-host": "ronreiter-meme-generator.p.rapidapi.com",
            "x-rapidapi-key": process.env.RAPID_API_KEY,
            ...uploadData.getHeaders(),
            useQueryString: true,
          },
          formData: {
            image: {
              value: stream,
              options: {
                filename: `${fileDetails.file_unique_id}.jpg`,
                contentType: "application/octet-stream",
              },
            },
          },
        };

        request(options, async (error, response, body) => {
          stream.close();

          if (error) {
            console.log("Error while uploading meme", error);

            bot.sendMessage(
              msg.chat.id,
              `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
            );
          } else {
            const response = JSON.parse(body);

            if (
              (response.status == "success" && !!response.name) ||
              (response.status == "error" && response.message == "File exists")
            ) {
              // Generate Meme
              try {
                const res = await axios.get(
                  "https://ronreiter-meme-generator.p.rapidapi.com/meme",
                  {
                    headers: {
                      "x-rapidapi-host":
                        "ronreiter-meme-generator.p.rapidapi.com",
                      "x-rapidapi-key": process.env.RAPID_API_KEY,
                    },
                    params: {
                      meme: fileDetails.file_unique_id,
                      top: chatData.topText,
                      bottom: bottomText,
                    },
                    responseType: "arraybuffer",
                  }
                );

                fs.writeFileSync(
                  `./images/meme_${fileDetails.file_unique_id}.jpg`,
                  Buffer.from(res.data),
                  "binary"
                );

                // Send meme to user
                bot.sendMessage(msg.chat.id, `Here is your meme 👇`);
                bot.sendPhoto(
                  msg.chat.id,
                  `./images/meme_${fileDetails.file_unique_id}.jpg`
                );
                await client.set(
                  msg.chat.id,
                  JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
                );

                // If you like it do share this bot with your friends
                // Also follow developer Amit Wani on Twitter @mtwn105
                bot.sendMessage(
                  msg.chat.id,
                  "Do you like this meme? Share it with your friends and follow me @mtwn105 on Twitter for more cool stuff 😉. If you want to support me, consider clicking the button below 👇",
                  {
                    replyMarkup: {
                      inline_keyboard: [
                        [
                          {
                            text: "@mtwn105",
                            url: "https://twitter.com/mtwn105",
                          },
                          {
                            text: "Support",
                            url: "https://rzp.io/l/dQtgHoQ6",
                          },
                        ],
                      ],
                    },
                  }
                );

                // Send Logs
                sendLogs(
                  {
                    Event: "Create Meme Processed",
                    Status: "Success",
                    Type: "Custom",
                    User: msg.chat.username,
                  },
                  "memer_create"
                );
              } catch (err) {
                console.log(
                  "Error while generating custom meme from third party",
                  err
                );
                bot.sendMessage(
                  msg.chat.id,
                  `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
                );
                await client.set(
                  msg.chat.id,
                  JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
                );

                // Send Logs
                sendLogs(
                  {
                    Event: "Create Meme Processed",
                    Status: "Error",
                    Type: "Custom",
                    User: msg.chat.username,
                  },
                  "memer_create"
                );
              }
            } else {
              console.log(
                "Error while uploading custom meme template to third party",
                { response }
              );

              bot.sendMessage(
                msg.chat.id,
                `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
              );
              await client.set(
                msg.chat.id,
                JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
              );
              // Send Logs
              sendLogs(
                {
                  Event: "Create Meme Processed",
                  Status: "Error",
                  Type: "Custom",
                  User: msg.chat.username,
                },
                "memer_create"
              );
            }
          }
        });
      } catch (err) {
        console.log("Error while generating meme", err);
        bot.sendMessage(
          msg.chat.id,
          `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
        );
        await client.set(
          msg.chat.id,
          JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
        );

        // Send Logs
        sendLogs(
          {
            Event: "Create Meme Processed",
            Status: "Error",
            Type: "Custom",
            User: msg.chat.username,
          },
          "memer_create"
        );
      }
    } else {
      console.log("Error occured while downloading image: ", err);

      bot.sendMessage(
        msg.chat.id,
        `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
      );
      await client.set(
        msg.chat.id,
        JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
      );

      // Send Logs
      sendLogs(
        {
          Event: "Create Meme Processed",
          Status: "Error",
          Type: "Custom",
          User: msg.chat.username,
        },
        "memer_create"
      );
    }
  } catch (err) {
    console.log("Error occured while creating custom meme: ", err);

    bot.sendMessage(
      msg.chat.id,
      `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
    );
    await client.set(
      msg.chat.id,
      JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
    );

    // Send Logs
    sendLogs(
      {
        Event: "Create Meme Processed",
        Status: "Error",
        Type: "Custom",
        User: msg.chat.username,
      },
      "memer_create"
    );

    throw err;
  }
};

// Admin messages
bot.on("*", async (msg) => {
  if (
    msg.chat.id == process.env.MY_CHAT_ID &&
    !!msg.caption &&
    msg.caption.includes("/message") &&
    (!!msg.photo || !!msg.video || !!msg.animation)
  ) {
    console.log("Message received from my chat id");
    console.log(msg);

    try {
      const keys = await client.keys("*");

      console.log("Sending message to ", keys.length, " people");

      let success = 0;

      for (const chatId of keys) {
        console.log("sending msg to", chatId);

        try {
          if (!!msg.photo) {
            bot.sendPhoto(chatId, msg.photo[msg.photo.length - 1].file_id);
          } else if (!!msg.video) {
            bot.sendVideo(chatId, msg.video.file_id);
          } else if (!!msg.animation) {
            bot.sendAnimation(chatId, msg.animation.file_id);
          }

          success++;
        } catch (err) {
          console.log("Failed to send message to ", chatId);
        }

        bot.sendMessage(
          msg.chat.id,
          "Sent messages successfully to " +
            success +
            "/" +
            keys.length +
            " people"
        );
      }
    } catch (err) {
      console.log("Error while sending message");
      bot.sendMessage(msg.chat.id, "Error while sending message ");
      return;
    }
  }
});

bot.start();
