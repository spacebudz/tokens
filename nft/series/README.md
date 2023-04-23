# Non-fungbile token (NFT) series

Mint a series of NFTs with metadata. After each mint you increase a counter id to ensure that previous minted NFTs stay unique forever. Optionally you can set a maximum supply.

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

const maxSupply = 100;

const { instanceId } = await new Contract(lucid)
  .deploy("MyNFT", maxSupply);

// ... wait for confirmation

const contract = new Contract(
  lucid,
  instanceId,
);

// counter id: 0
await contract.mint({ name: "MyNFT #0", image: "ipfs://<hash>" });

// ... wait for confirmation

// counter id: 1
await contract.mint({ name: "MyNFT #1", image: "ipfs://<hash>" });

// ... wait for confirmation

console.log(await contract.getMetadata(1));

// Burn NFT with id 0
await contract.burn(0);
```

## Contract instance

```ts
deploy(name: string): Promise<{ txHash: string; instanceId: string; }>
```
```ts
getMetadata(): Promise<Metadata>
```
```ts
mint(metadata: Metadata): Promise<string>
```
```ts
burn(): Promise<string>
```
```ts
getMaxSupply(): number | null
```
```ts
getNextId(): Promise<number>
```
```ts
transferOwnership(address: string, datum?: string | undefined): Promise<string>
```
```ts
renounceOwnership(): Promise<string>
```