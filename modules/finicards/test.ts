import { readFile } from "fs/promises";
import path, { join } from "path";
import sharp from "sharp";

const maiSakurajima = {
  cardName: "Mai Sakurajima",
  type: "Anime Waifu",
  series: "Rascal Does Not Dream",
  cardId: "1",
  rarity: "FA",
  strength: "C",
  agility: "B",
  endurance: "A",
  intellect: "A",
  luck: "B",
  imageUrl:
    "https://preview.redd.it/the-mbti-type-of-mai-sakurajima-what-it-says-about-the-kind-v0-w4q8p9t0hmzc1.jpg?width=736&format=pjpg&auto=webp&s=2e46c6591d764e19dd36eda49f0451b1b2421f52",
  imageUrl1:
    "https://imgs.search.brave.com/MerXaznB5pT7Cykor7W_VZba4YJWaoSDxCfHk2AYomE/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9jNC53/YWxscGFwZXJmbGFy/ZS5jb20vd2FsbHBh/cGVyLzk2MC82ODIv/NDM0L3Nha3VyYWpp/bWEtbWFpLWJ1bm55/LWdpcmwtc2VucGFp/LWFuaW1lLWdpcmxz/LWFuaW1lLWZhbi1h/cnQtaGQtd2FsbHBh/cGVyLXByZXZpZXcu/anBn",
};

const erinaNakiri = {
  cardName: "Erina Nakiri",
  type: "Anime Waifu",
  series: "Food Wars",
  cardId: "2",
  rarity: "FA",
  strength: "C",
  agility: "A",
  endurance: "A",
  intellect: "B",
  luck: "C",
  imageUrl1: "https://static.zerochan.net/Nakiri.Erina.full.2799162.png",
  imageUrl:
    "https://w0.peakpx.com/wallpaper/1018/726/HD-wallpaper-erina-nakiri-food-wars-girl-love.jpg",
};

const mikuNakano = {
  cardName: "Miku Nakano",
  type: "Anime Waifu",
  series: "Quintessential Quintuplets",
  cardId: "3",
  rarity: "FA",
  strength: "C",
  agility: "B",
  endurance: "A",
  intellect: "D",
  luck: "B",
  imageUrl1:
    "https://i.etsystatic.com/26149472/r/il/40e1fc/2897491135/il_1080xN.2897491135_8lsa.jpg",
  imageUrl: "https://i.redd.it/b5ulsiq6mz841.jpg",
};

const yukiNagato = {
  cardName: "Yuki Nagato",
  type: "Anime Waifu",
  series: "Haruhi Suzumiya",
  cardId: "4",
  rarity: "FA",
  strength: "A",
  agility: "A",
  endurance: "B",
  intellect: "S",
  luck: "C",
  imageUrl:
    "https://preview.redd.it/yuki-nagato-v0-5parncw6spv81.jpg?auto=webp&s=0116ff1e4db4d81420ba963623ca0c6cebc401eb",
};

const createImage = async (testCard) => {
  try {
    console.log(__dirname);
    const contents = await readFile(join(__dirname, "full-art-template.svg"));
    let contentString = contents.toString();

    const res = await fetch(testCard.imageUrl);
    const data = await res.arrayBuffer();
    const base64String = `data:${res.headers.get(
      "content-type"
    )};base64,${Buffer.from(data).toString("base64")}`;

    // Card Name
    contentString = contentString.replace("{card_name}", testCard.cardName);
    // Card Type
    contentString = contentString.replace("{type}", testCard.type);
    // Series
    contentString = contentString.replace("{series}", testCard.series);
    // Card Id
    contentString = contentString.replace("{card_id}", testCard.cardId);
    // Rarity
    contentString = contentString.replace("{rarity}", testCard.rarity);
    // Strength
    contentString = contentString.replace("{strength}", testCard.strength);
    // Agility
    contentString = contentString.replace("{agility}", testCard.agility);
    // Endurance
    contentString = contentString.replace("{endurance}", testCard.endurance);
    // Intellect
    contentString = contentString.replace("{intellect}", testCard.intellect);
    // Luck
    contentString = contentString.replace("{luck}", testCard.luck);
    // Image
    contentString = contentString.replace("{image_base64}", base64String);

    const sharpItem = sharp(Buffer.from(contentString), { density: 300 });
    const thing = await sharpItem
      .resize({ width: 600 })
      .png()
      .toFile(path.join(__dirname, `${testCard.cardId}.png`));
    console.log("thing?", thing);
  } catch (err) {
    console.error(err);
  }
};

await createImage(maiSakurajima);
await createImage(erinaNakiri);
await createImage(mikuNakano);
await createImage(yukiNagato);
