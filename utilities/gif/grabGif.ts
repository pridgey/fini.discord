import fetch from "node-fetch";

export const grabGif = (
  query: string,
  rating: "g" | "pg" | "pg-13" | "r" = "pg-13"
) => {
  // URL-arize the query param
  const urlarized = encodeURI(query);

  const giphyUrl = `https://api.giphy.com/v1/gifs/random?api_key=${process.env.GIPHY_KEY}&tag=${urlarized}&rating=${rating}`;
  const tenorUrl = `https://g.tenor.com/v1/search?key=${process.env.TENOR_KEY}&q=${urlarized}`;

  const engine: "giphy" | "tenor" = "giphy";

  // Fetch a gif from tenor and return a random one
  return fetch(engine === "giphy" ? giphyUrl : tenorUrl)
    .then((results) => results.json())
    .then((data) => {
      const engineDict = {
        giphy: parseGiphyGif,
        tenor: parseTenorGif,
      };
      const result = engineDict[engine](data);

      return result;
    });
};

const parseGiphyGif = ({ data }) => data.images.downsized.url;

const parseTenorGif = ({ results }) => {
  const gifIndex = Math.round(Math.random() * results.length);
  const gifData = results[gifIndex];
  const { url } = gifData?.media[0]?.mediumgif ?? { url: null };
  return url;
};
