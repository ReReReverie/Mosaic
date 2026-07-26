import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Small no-key discovery adapter for the Mosaic workflow. The references are
 * open-license Wikimedia Commons examples; production providers can replace
 * this route without changing the board UI.
 */
export async function POST() {
  return NextResponse.json(
    {
      provider: "Wikimedia Commons demo adapter",
      references: [
        {
          id: "online-apple-crumble",
          source: "online",
          title: "Warm apple crumble, Copenhagen Street Food Market",
          previewUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Warm%20apple%20crumble%2C%20Copenhagen%20Street%20Food%20Market.jpg?width=900",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Warm_apple_crumble,_Copenhagen_Street_Food_Market.jpg",
          provider: "Wikimedia Commons",
          creator: "Philip Mallis",
          license: "CC BY-SA 2.0",
          score: 91,
          reasons: ["Warm food subject", "Portrait crop fits a poster", "Rich amber palette"],
          analysis: {
            angle: "Eye-level close-up",
            placement: "Centered subject",
            crop: "Tight portrait crop",
            lighting: "Warm side light",
            perspective: "Shallow depth",
            focal: "Dessert texture",
            negativeSpace: "Limited",
            texture: "Crisp and tactile",
            tags: ["warm", "food", "editorial", "portrait"],
            colors: ["#B65A2A", "#F1C77A", "#6C321F"],
          },
        },
        {
          id: "online-night-market",
          source: "online",
          title: "Busting night market food stall",
          previewUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/DFC%202568%20A%20bustling%20night%20market%20food%20stall%20in%20Thailand%20with%20customers%20browsing%20grilled%20skewers%20and%20a%20vendor%20preparing%20orders%20under%20warm%20hanging%20lights.jpg?width=900",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:DFC_2568_A_bustling_night_market_food_stall_in_Thailand_with_customers_browsing_grilled_skewers_and_a_vendor_preparing_orders_under_warm_hanging_lights.jpg",
          provider: "Wikimedia Commons",
          creator: "PattayaPatrol",
          license: "CC BY-SA 4.0",
          score: 87,
          reasons: ["Warm social atmosphere", "High-contrast lighting", "Adds human context"],
          analysis: {
            angle: "Eye-level environmental shot",
            placement: "Layered subjects",
            crop: "Wide landscape crop",
            lighting: "Warm practical lights",
            perspective: "Deep receding scene",
            focal: "Lit food counter",
            negativeSpace: "Moderate",
            texture: "Busy market detail",
            tags: ["warm", "food", "community", "night"],
            colors: ["#F2A23A", "#252225", "#B33D28"],
          },
        },
        {
          id: "online-market-seller",
          source: "online",
          title: "Woman selling cooked food at the market",
          previewUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Woman%20selling%20cooked%20food%20at%20the%20market.jpg?width=900",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Woman_selling_cooked_food_at_the_market.jpg",
          provider: "Wikimedia Commons",
          creator: "Christine Xuereb Seidu",
          license: "CC BY-SA 4.0",
          score: 84,
          reasons: ["Human-centered storytelling", "Natural warm colors", "Useful subject placement"],
          analysis: {
            angle: "Eye-level portrait",
            placement: "Subject offset left",
            crop: "Medium portrait crop",
            lighting: "Soft daylight",
            perspective: "Contextual background depth",
            focal: "Seller and prepared food",
            negativeSpace: "Moderate right side",
            texture: "Natural fabric and food",
            tags: ["warm", "food", "people", "documentary"],
            colors: ["#A55D31", "#D5A85B", "#3E513A"],
          },
        },
      ],
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
