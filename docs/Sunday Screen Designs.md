Church Operations · first three builds

# Sunday Screen Designs

What the three red cards on your Miro board should look like, drawn with shadcn parts. The logic (check-in, contact log, status moves) is yours; every form, card, drawer and badge comes from shadcn so the agent has less to invent. These are mockups with example names, not final pixels.

Build 1 · During service · phone

## Quick Check-in

A volunteer at the door finds someone or registers them in one thumb's reach. The search box is always focused; "New visitor" opens a bottom drawer, not a new page.

**Check-in**

Sunday Service · 11 Oct

24 today

ali

2 matches

AU

Aline Uwase

VisitorKinyinya

Check in

AM

Alice Mukamana

MemberKagugu

Here

Not on the list? Register them below.

Alice Mukamana checked in

New visitor

Check-in

Follow-ups

Board

Attention

**Check-in**

Sunday Service · 11 Oct

**New visitor**

Name and phone are required.

First name

Eric

Last name

Mugisha

Phone

+250788 123 456

Gender

Male

Female

Age group

Youth

Adult

Location

Kagugu

Gave their life to Christ today

CancelSave and check in

### shadcn parts

InputButtonBadgeAvatarFieldLabelInput GroupItemDrawerToggle GroupSwitchToast

already installedadd with the CLI

- Search box uses Input Group, so the icon sits inside the field.
- Each result is an Item: avatar, name, badge, one action button.
- Gender and age group are Toggle Groups, not dropdowns, so each is one tap.
- Inputs stay at 16px text on the real screen so iPhones do not zoom.
- Duplicate phone? Show "Already registered as Name" with a Check in button.

Build 2 · After service · phone

## My Follow-ups

Each volunteer sees only the people assigned to them, most urgent first. Call and WhatsApp are real links; logging the contact takes one drawer.

**My Follow-ups**

5 people waiting

SK

GI

Grace Ineza

New ConvertAsk pastor

Never contacted

CallWhatsAppLog

DK

Divine Keza

VisitorGisozi

Last contacted 12 days ago

CallWhatsAppLog

JN

Jean Claude Niyo

M1 ClassKagugu

Last contacted 6 days ago

Check-in

Follow-ups

Board

Attention

**My Follow-ups**

5 people waiting

**Log contact**

Grace Ineza

How did you reach out?

Call

WhatsApp

SMS

Visit

What happened?

Reached

Note (optional)

Wants to join M1 class next month.

CancelSave

Saving moves a Not Started person to Contacted.

### shadcn parts

CardBadgeButtonAvatarSelectDrawerToggle GroupTextareaEmptySkeletonToast

already installedadd with the CLI

- The red, amber and green dot is days since last contact: under 4, 4 to 10, over 10 or never.
- Order: asked for pastor first, never contacted next, then oldest contact.
- Empty state uses the Empty component: "Nobody is waiting on you. Thank you for serving."
- Skeleton cards while loading, so the list never jumps.
- Call and WhatsApp are plain links. The page cannot know the call happened, so Log is always a separate tap.

Build 3 · After service · desktop, tablet

## Follow-up Board

The five statuses you already have, as columns. On a laptop you drag a card; on a phone you use the "Move to" menu, which must work without dragging.

CO**Church Operations**Home / Board

Assigned to: EveryoneCategory: All

Not Started7

Grace Ineza

New Convert never

KaguguSK

Move to

Contacted

Met

Ongoing

Completed

Eric Mugisha

Visitor 1 day

KaguguUnassigned

Contacted5

Divine Keza

Visitor 12 days

GisoziRM

Met3

Jean Claude Niyo

M1 Class 6 days

KaguguSK

Ongoing4

Alice Mukamana

Member 2 days

KaguguRM

Drop here

Completed12

Last 30 days only

### shadcn parts, and one gap

CardBadgeAvatarSelectDropdown MenuScroll AreaSheetTabsSkeleton

- shadcn has no Kanban component. The columns and cards are shadcn pieces; dragging comes from a small library (`@dnd-kit`), which is the one new dependency.
- Clicking a card opens the Person drawer you already built. Moves are saved right away and rolled back with a message if the database refuses.
- Below tablet width, show one column at a time with Tabs across the top, instead of five columns side by side.

What to add

## shadcn parts for these screens

Your project uses the `base-nova` style, so the CLI installs the Base UI versions. Components that exist in your repo already are not listed.

| Part | Used for |
| --- | --- |
| `drawer` | Bottom sheet for New visitor and Log contact on phones. Keep `sheet` for desktop. |
| `input-group` | Search box with icon, phone box with +250 prefix. |
| `item` | Result rows and person rows with avatar, text and an action. |
| `toggle-group` | Gender, age group, contact method: one tap each. |
| `switch` | "Gave their life to Christ today". |
| `textarea` | Contact note. |
| `tabs` | Board columns on phones. |
| `empty`, `skeleton`, `spinner` | Empty lists, loading cards, buttons that are saving. |
| toast component | "Alice Mukamana checked in", "Could not save: not allowed". The docs now list `Toast`; older projects use `sonner`. Let the CLI decide which one exists. |

```
npx shadcn@latest add drawer input-group item toggle-group switch textarea tabs empty skeleton spinner
```