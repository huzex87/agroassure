# AgroAssure brand guide

**The field, assured.** Trust you can check: every inspection signed by the phone that made it, evidence kept where it cannot be changed, certificates anyone can verify.

## Personality

Grounded, exact, plainly spoken, quietly proud. It looks like something made for people who work outdoors and answer for what they sign. It is not government grey, not startup neon, and not farm clip art.

## Name

**AgroAssure**, one word, capital A twice. Never "Agro Assure", "Agro-Assure" or "AGROASSURE".

- Tagline for introductions: *Inspections, findings and certificates for fertilizer and agro-input businesses.*
- When a regulator uses the platform, **their name leads** ("Programme of Katsina State Ministry of Agriculture") and AgroAssure sits small beside it.
- AgroAssure never appears as the issuer of a certificate. It records and renders them on the regulator's behalf, and the certificate says so.

## Logo

A solid leaf with a check cut out of it, and a gold stem. Growth and assurance in one shape. It is filled, not outlined, so it still reads at 16 pixels.

| File | Use |
|---|---|
| `brand/mark.svg` | Pine tile. For light surfaces: the browser tab, the app icon, documents |
| `brand/mark-reverse.svg` | No tile. For Pine surfaces, such as the console rail and the sign-in panel |
| `brand/seal.svg` | Ringed seal. For certificates and the public verification page, never as the app icon |

- **Clear space:** at least the height of the check on every side.
- **Minimum size:** 16 px on screen, 12 mm in print.
- **Do not** recolour the leaf, rotate it, add a shadow or gradient, outline it, place it on a busy photograph, or stretch it.
- **Wordmark:** "AgroAssure" in Plus Jakarta Sans Bold. Pine on light, white on Pine.

## Colour

Four colours with jobs, taken from the field.

| Name | Hex | Job | Contrast |
|---|---|---|---|
| **Pine** | `#0B2A20` | Ink of the product. The rail, the hero, headings | 15:1 on white |
| **Forest** | `#166A45` | The working green. Buttons, links, the selected state | 6.6:1 on white |
| **Leaf** | `#2FA45F` | Shapes that are seen, not read: the mark, charts, focus rings | 3.2:1. **Never for text** |
| **Millet** | `#F2B01E` | The harvest gold. The one thing to do next, the current page, the seal | Pine text on it, 8:1. **Never as text on white** |

**Field neutrals** (a green-tinted grey, never a true grey, which looks dirty beside Pine):

| Name | Hex | Use |
|---|---|---|
| Background | `#F1F5EF` | The page |
| Surface | `#FFFFFF` | Cards, panels, fields |
| Sunk | `#E8EEE5` | Table headers, quiet fills |
| Line | `#D9E2D5` | Borders |
| Muted ink | `#435A4D` | Secondary text |
| Faint ink | `#587062` | Captions, placeholders (4.5:1 minimum) |

**Status** is its own colour and is always paired with a word and an icon:

| Meaning | Text | Tint |
|---|---|---|
| Healthy | `#187A44` | `#E5F4EA` |
| Caution | `#A45E07` (a burnt amber, never Millet) | `#FDF3E5` |
| Serious | `#B93A2E` | `#FDF0EE` |

**Charts**, in order: Forest `#166A45`, Millet `#F2B01E`, Leaf `#2FA45F`, laterite `#C2552B`, slate `#3F6F8E`.

**Proportion.** Mostly neutrals, then Pine and Forest, a little Leaf. Millet shows up once or twice on a screen. Used rarely it stays meaningful; used everywhere it is decoration.

## Type

- **Plus Jakarta Sans**, weights 400, 500, 600, 700, 800. Headings are heavy (700 to 800) with tight tracking; the home hero is 800.
- **IBM Plex Mono** for licence numbers, references and codes.
- **Scale:** Hero 36/40, Display 28/34, Title 20/28, Heading 15/22, Body 14/22, Caption 12/18.
- Numbers that line up in columns use tabular figures.

## Shape and surface

- **Radii:** controls 10, cards 14, badges a pill. Nothing else.
- **Shadows:** three levels (raised, lifted, overlay), tinted with Pine.
- **Furrows:** a faint diagonal ploughed-row pattern (white at 4.5% on Pine). Only on the hero and the sign-in panel, and never behind text that must be read at a glance.

## Voice

Plain, active, specific. Say what happens.

| Write | Not |
|---|---|
| Email me a sign-in link | Initiate authentication |
| Nothing arrived? Check spam, or try again. | An error occurred |
| Sign out this phone | Revoke device credentials |

One word per thing: **Facility**, **Visit**, **Inspection**, **Finding**, **Decision**, **Certificate**. Roles: **Administrator**, **Reviewer**, **Authorising officer**, **Auditor**, **Inspector**.

## Where it appears

- **Console:** Pine rail with a gold marker on the current page, a Pine hero on Home, white cards on the green-tinted page.
- **Sign-in:** a Pine brand panel beside the form, with *The field, assured.*
- **Phone app:** light and high-contrast, because it is used in full sun. Large touch targets. Forest buttons.
- **Certificate:** white paper. The regulator's own mark leads; the seal sits beside it. Forest accents.
- **Email:** a Pine tile with the letter A, a Forest button, plain text under it.
- **App icon:** a Pine square with the leaf, gold stem and check. The Android adaptive icon uses Pine as its background.

## Where the values live

- Console tokens: `apps/console/app/globals.css`
- Phone tokens: `apps/field/src/theme.ts`
- Logo files: `docs/brand/`
- Phone icons: `apps/field/assets/`

When a screen uses a colour that is not in this guide, change the screen.

## Before shipping a new screen

1. Does every status colour have a word and an icon beside it?
2. Is Millet used at most twice, and never as text on white?
3. Is Leaf used only for shapes?
4. Is the caption text at least 4.5:1 against its background?
5. Do the words match the vocabulary above?
