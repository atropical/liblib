# Library usage — Acme Checkout

- Generated: 2026-08-01T10:00:00.000Z
- Schema: `liblib/usage-snapshot@3`
- File key: `abc123`
- Scope: selection — 2 frame(s)
- Pages: Checkout
- frames: 2
- components: 2
- deviations: 2

## Components used

| Component | Source | Instances | Used as |
| --- | --- | --- | --- |
| Button / Primary | library | 7 | Size=Large, State=Default · Size=Medium, State=Hover |
| Chip / Price | library | 3 | Size=Small, Intent=Main |

### Button / Primary

- Key: `btnkey00000000000000000000000000000000001`
- Set key: `btnset0000000000000000000000000000000001`
- Source: library
- Frames: Checkout / Order Summary
- Used as: `Size=Large, State=Default`
- Used as: `Size=Medium, State=Hover`
- `Icon#12:3` (INSTANCE_SWAP), default: abc
- `Size` (VARIANT), default: Medium — options: Large | Medium

### Chip / Price

- Key: `chipkey0000000000000000000000000000000001`
- Source: library
- Frames: Checkout / Order Summary
- Used as: `Size=Small, Intent=Main`

## Frames

### Checkout / Order Summary

- Node: [`10:1`](https://www.figma.com/design/abc123/Acme-Checkout?node-id=10%3A1&m=dev)
- Size: 1440 × 900
- Hash: `ad0779833c2f680d`

```
FRAME "Order Summary" #10:1
  FRAME "Totals" @24,96 ⚠ itemSpacing renders 20, spacing/md is 16 #10:2
    TEXT "Line item" @0,0 text: "Subtotal, before tax" #10:3
    INSTANCE "Price Chip" ← Chip / Price [chipkey0000000000000000000000000000000001] (Size=Small, Icon#12:3=abc) @0,32 #10:4
  GROUP "Legacy Banner" @24,320 #10:5 hidden
    TEXT "Old promo copy" text: "Ends Friday, midnight" #10:6
  INSTANCE "Confirm" ← Button / Primary [btnkey00000000000000000000000000000000001] (Size=Large) @24,420 #10:7
```

### Checkout / Receipt

- Node: [`20:1`](https://www.figma.com/design/abc123/Acme-Checkout?node-id=20%3A1&m=dev)
- Size: 1440 × 640
- Hash: `9fd547131bdad735`

```
FRAME "Receipt" #20:1
  TEXT "Thanks" text: "Thank you" #20:2
```

## Off-system

| Frame | Layer | Kind | Detail | Intentional |
| --- | --- | --- | --- | --- |
| Checkout / Order Summary | Order Summary / Totals | hardcoded-spacing | itemSpacing 20 is not a token value. | no |
| Checkout / Receipt | Receipt / Thanks | local-component | Instance of 'Local Note', defined in this file rather than a library. | yes |

## Variables bound

### Primitives (modes: Light, Dark)

| Variable | Type | Light | Dark |
| --- | --- | --- | --- |
| spacing/md | FLOAT | 16 | 16 |

## Styles used

| Style | Type | Key |
| --- | --- | --- |
| Colour / Brand / Primary | PAINT | `style0001` |
| Text / Body | TEXT | `style0002` |
