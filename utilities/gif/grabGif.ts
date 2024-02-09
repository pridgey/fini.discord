import seedrandom from "seedrandom";

export const grabGif = async (
  query: string,
  engine: "giphy" | "tenor" = "giphy",
  rating: "g" | "pg" | "pg-13" | "r" = "pg-13"
) => {
  try {
    // URL-arize the query param
    const urlarized = encodeURI(query);

    const giphyUrl = `https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_KEY}&q=${urlarized}&rating=${rating}`;
    const tenorUrl = `https://g.tenor.com/v1/search?key=${process.env.TENOR_KEY}&q=${urlarized}`;
    const fetchURL = engine === "giphy" ? giphyUrl : tenorUrl;

    // Fetch a gif from tenor and return a random one
    const fetchResponse = await fetch(fetchURL);
    const fetchData = await fetchResponse.json();
    const rng = seedrandom(Date.now());

    // Get gif
    if (engine === "giphy") {
      const randomNumber = Math.round(rng() * fetchData.data.length - 1);
      const url: string =
        fetchData?.data?.[randomNumber]?.images.downsized.url || "";
      return url;
    } else {
      const randomNumber = Math.round(rng() * fetchData.results.length - 1);
      const url: string = fetchData?.results?.[randomNumber].url || "";
      console.log("Tenor gif return", {
        url,
        result: fetchData.results?.[randomNumber],
      });
      return url;
    }
  } catch (err) {
    console.error("Error grabbing gif:", err);
    return "";
  }
};
