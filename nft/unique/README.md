# Non-fungible token (NFT) unique

Mint a single unique NFT with metadata.

## Get started
```ts
import { Contract } from "./mod.ts";
import {
  Blockfrost,
  Lucid,
} from "https://deno.land/x/lucid@0.10.2/mod.ts";

const lucid = await Lucid.new(
  new Blockfrost(
    "https://cardano-preprod.blockfrost.io/api/v0",
    "<project_id>",
  ),
  "Preprod",
);

lucid.selectWalletFromSeed(
  "<seed_phrase>",
);

const { instanceId } = await new Contract(lucid)
  .deploy({
    name: "MyNFT",
    image: "ipfs://<hash>",
  });

// ... wait for confirmation

const contract = new Contract(
  lucid,
  instanceId,
);

console.log(await contract.getMetadata());

// Burn the NFT
await contract.burn();
```

## Contract instance

```ts
deploy(metadata: Metadata): Promise<{ txHash: string; instanceId: string; }>
```
```ts
getMetadata(): Promise<Metadata>
```
```ts
burn(): Promise<string>
```