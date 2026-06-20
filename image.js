const axios = require("axios");
const fs = require("fs");

async function fetchImages() {
  const urls = [];

  for (let i = 1; i <= 500; i++) {
    const url = `https://photofilms.in/images/portfolio/wedding/${i}.webp`;

    try {
      const response = await axios.head(url);

      if (response.status === 200) {
        console.log("Found:", url);
        urls.push(url);
      }
    } catch (e) {
      // image does not exist
    }
  }

  fs.writeFileSync("wedding-images.json", JSON.stringify(urls, null, 2));
  console.log(`Found ${urls.length} images`);
}



fetchImages();