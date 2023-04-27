import {
  concat,
  Data,
  fromHex,
  fromText,
  Lucid,
  toHex,
  toLabel,
} from "../../deps.ts";
import metadata from "./metadata.json" assert { type: "json" };
import * as D from "./types.ts";

const lucid = await Lucid.new();

const baseName = metadata[0].name.replace(/\s/g, "").slice(0, 8);

if (metadata.length !== 10000) {
  throw new Error("Only 10k collections work at the moment.");
}

console.log("Generating..");

const data = metadata.map((m, id) =>
  toHex(concat(
    fromHex(
      lucid.utils.datumToHash(
        Data.to<D.DatumMetadata>({
          metadata: Data.castFrom<D.Metadata222>(
            Data.fromJson(m),
            D.Metadata222,
          ),
          version: 1n,
          extra: Data.from(Data.void()),
        }, D.DatumMetadata),
      ),
    ), // metadata
    fromHex(toLabel(100) + fromText(`${baseName}${id}`)),
    fromHex(toLabel(222) + fromText(`${baseName}${id}`)),
    fromHex(fromText(`${id}`)),
  ))
);

await Deno.writeTextFile("./merkle_data.gen.json", JSON.stringify(data));

console.log("Generation done!");
