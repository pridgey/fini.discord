import { pb } from "../../utilities/pocketbase";

const doit = async () => {
  const things = await pb.collection("anistock_details").getList(1, 30, {
    sort: "-price_updated_at",
  });

  // const simplified = things.items.map((item) => {
  //   const stockRecords = item.expand?.anistock_stock_via_anime || [];
  //   return {
  //     id: item.id,
  //     title: item.title,
  //     expanded: stockRecords?.length ?? -1,
  //     stocks: stockRecords.map((stock) => ({
  //       id: stock.id,
  //       price: stock.stock_price,
  //     })),
  //   };
  // });

  console.log("Debug: things", JSON.stringify(things, null, 2));
};
doit();
