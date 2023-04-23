# Fungible token (FT)

Mint a fungible token with metadata.

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

const totalSupply = 1000000000n;

const { instanceId } = await new Contract(lucid)
  .deploy(totalSupply, {
    name: "MyFT",
    description: "This is my fungible token.",
    decimals: 2,
  });

// ... wait for confirmation

const contract = new Contract(
  lucid,
  instanceId,
);

console.log(await contract.getMetadata());

// Burn specific quantity of FT
await contract.burn(2000n);
```

## Contract instance

```ts
deploy(totalSupply: bigint, metadata: Metadata): Promise<{ txHash: string; instanceId: string; }>
```
```ts
getMetadata(): Promise<Metadata>
```
```ts
changeMetadata(metadata: Metadata): Promise<string>
```
```ts
burn(quantity: bigint): Promise<string>
```
```ts
transferOwnership(address: string, datum?: string | undefined): Promise<string>
```
```ts
renounceOwnership(): Promise<string>
```