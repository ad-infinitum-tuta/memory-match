```md
# Product Requirements Document: Customizable Vocabulary Matching Game

## 1. Product Overview

Build a browser-based, locally stored vocabulary-learning game. Users create a personal vocabulary library containing target-language text and/or audio, optional reference-language definitions and images, and lexical relationships between vocabulary items.

The app generates randomized vocabulary games from this library in two game styles:

1. **Memory** — all cards begin hidden; the player flips two cards at a time and tries to find matches.
2. **Match** — all cards are visible; the player selects two cards at a time and tries to match them.

The app supports these game modes:

- Classic
- Synonyms
- Antonyms
- Generic/Specific
- Whole/Part

The app is a static browser-based application hosted on GitHub Pages. It does not require user accounts or a cloud server. All user data is stored locally in the browser.

The visual direction should use `Memory-Match-reference.jpg` as a reference: a centered, compact game board; title and moves/score display above the board; evenly sized pale cards with subtle colored borders; and settings/restart controls near the game board.

---

## 2. Goals

### 2.1 Primary Goals

- Let users create and manage a reusable personal vocabulary library.
- Generate randomized, valid vocabulary games from the saved library.
- Support text, target-language audio, definitions, images, and lexical relationships.
- Prevent duplicate or ambiguous cards from appearing in the same game.
- Store all user data locally.
- Support local media upload, import, and export.
- Support desktop and mobile browsers, with a landscape prompt on narrow mobile screens.

### 2.2 Non-Goals for MVP

The MVP does not include:

- User accounts, authentication, cloud storage, or synchronization.
- Shared libraries, public decks, classes, or collaboration.
- In-browser microphone recording.
- Spaced repetition, learner profiles, or historical performance statistics.
- Translation APIs, dictionary APIs, text-to-speech, AI content generation, or speech recognition.
- Decks, folders, tags, or multiple vocabulary libraries.
- Keyboard navigation requirements.
- Directional semantic modeling for Generic/Specific or Whole/Part relationships.
- Social features, public content, or moderation systems.

---

## 3. Definitions

### 3.1 Vocabulary Item

A vocabulary item is the primary stored learning record. Each vocabulary item has one stable, unique item ID.

A vocabulary item may contain these elements:

| Element | Required | Description |
|---|---:|---|
| Target-language text | Optional | A word, phrase, or sentence in the target language |
| Target-language audio | Optional | An uploaded audio file for target-language pronunciation or audio practice |
| Reference-language definition | Optional | A translation, definition, explanation, or reference-language meaning |
| Image | Optional | An uploaded image associated with the vocabulary item |

A vocabulary item must satisfy both requirements before it can be saved:

1. It must contain at least one target-language element:
   - target-language text, or
   - target-language audio.
2. It must contain at least two total elements from the four supported element types.

Examples of valid vocabulary items:

```text
Target text + definition
Target audio + definition
Target text + image
Target audio + image
Target text + target audio
Target text + target audio + definition + image
```

Examples of invalid vocabulary items:

```text
Target text only
Target audio only
Definition only
Image only
Definition + image only
```

### 3.2 Lexical Relationship

A lexical relationship is a separate mapping between two vocabulary-item IDs. The relationship mapping does not duplicate the vocabulary items' text, audio, image, or definition fields.

Supported relationship types:

- Synonym
- Antonym
- Generic/Specific
- Whole/Part

All relationship types are treated as **bidirectional for game generation**. The system only needs to store that the two vocabulary items are connected by a specific relation type. It does not need to determine which item is generic versus specific or which item is whole versus part.

Examples:

```text
rápido ↔ veloz       Synonym
caliente ↔ frío       Antonym
manzana ↔ fruta       Generic/Specific
rueda ↔ coche         Whole/Part
```

### 3.3 Generated Game Pair

A generated game pair is a temporary runtime object used only in an active game. It is not permanently stored in the vocabulary library.

There are two kinds of generated pairs:

1. **Classic pair**  
   A pair created from two elements within one vocabulary item.

2. **Relationship pair**  
   A pair created from one target-language element from each of two vocabulary items connected by a saved lexical relationship mapping.

---

## 4. Game Styles

## 4.1 Memory Style

In Memory style:

- All cards begin face down.
- The player selects one card and then selects a second card.
- Selecting the second valid card completes one turn.
- The turns counter increments when the second valid card is selected, regardless of whether the cards match.
- If the selected cards match:
  - Show a brief green outline/pulse success animation.
  - Keep both cards face up.
  - Disable both cards permanently.
  - Do not allow matched audio cards to replay.
- If the selected cards do not match:
  - Keep both cards revealed until required audio playback is complete.
  - Wait four seconds after the last selected audio finishes playing.
  - Flip both cards back simultaneously with a horizontal flip animation.
- The game ends when every valid pair has been matched.
- If a red herring is enabled, it remains unmatched and may remain visible after all valid pairs are completed.

### 4.1.1 Memory Card Behavior

- A selected card flips horizontally to reveal its content.
- Selecting a face-down target-audio card automatically plays its audio once.
- Once an audio card is revealed and still selectable, it displays a replay control.
- If the player selects a second audio card while the first selected audio card is still playing:
  - stop the first audio immediately;
  - start the second audio immediately.
- Clicks on the following do nothing and do not increment the turn count:
  - already matched cards;
  - cards currently animating;
  - cards temporarily locked during mismatch handling;
  - empty/inactive grid positions.

### 4.1.2 Memory Completion State

When every valid pair has been matched:

- Display a completion message.
- Display total turns.
- Display a prominent **Play again** button.
- Leave the red herring visible if one is present.

---

## 4.2 Match Style

In Match style:

- All cards begin face up.
- The user selects two cards they believe form a match.
- A target-audio card autoplays once whenever it is selected.
- A selected audio card has a replay control while selected.
- Matching cards disappear after a brief success animation.
- Nonmatching cards are deselected after an error sequence.
- Score begins at `0`.
- A correct pair adds `1` point.
- An incorrect pair subtracts `1` point.
- Negative scores are allowed.
- The game ends when every valid pair has been matched.
- If a red herring is enabled, it remains unmatched and may remain visible after all valid pairs are completed.

### 4.2.1 Correct Match Behavior

When the player selects a correct pair:

1. Show a brief green outline/pulse success animation.
2. Increase score by `1`.
3. Remove both matched cards from the board.
4. Continue the game with remaining cards.

### 4.2.2 Incorrect Match Behavior

When the player selects a nonmatching pair:

1. Keep both cards selected for `0.5` seconds.
2. Shake both cards.
3. The shake animation rotates each card approximately 5 degrees left and right several times in quick succession.
4. Decrease score by `1`.
5. Deselect both cards.
6. Unlock the board for the next selection.

### 4.2.3 Match Completion State

When every valid pair has been matched:

- Display a completion message.
- Display final score.
- Display a prominent **Play again** button.
- Leave the red herring visible if one is present.

---

## 5. Game Modes

The app supports five game modes.

| Game Mode | Pair Source | Match Definition |
|---|---|---|
| Classic | Two elements from one vocabulary item | Both cards belong to the same vocabulary-item ID |
| Synonyms | Two vocabulary items linked by a Synonym relation | Both cards belong to the same lexical-relationship mapping |
| Antonyms | Two vocabulary items linked by an Antonym relation | Both cards belong to the same lexical-relationship mapping |
| Generic/Specific | Two vocabulary items linked by a Generic/Specific relation | Both cards belong to the same lexical-relationship mapping |
| Whole/Part | Two vocabulary items linked by a Whole/Part relation | Both cards belong to the same lexical-relationship mapping |

---

## 6. Classic Mode Generation

Classic mode creates matched pairs from elements within a single vocabulary item.

### 6.1 Valid Classic Pairs

Every Classic pair must include at least one target-language element.

Valid combinations:

| Card A | Card B |
|---|---|
| Target-language text | Reference-language definition |
| Target-language audio | Reference-language definition |
| Target-language text | Image |
| Target-language audio | Image |
| Target-language text | Target-language audio |

Invalid combination:

| Card A | Card B | Reason |
|---|---|---|
| Reference-language definition | Image | Neither card is a target-language element |

### 6.2 Classic Generation Rules

For a Classic game:

1. Find vocabulary items that can produce at least one valid Classic pair.
2. Randomly select eligible vocabulary-item IDs.
3. For each selected vocabulary item:
   - identify all valid element-pair combinations;
   - select one valid combination with equal probability;
   - generate exactly one pair.
4. Each selected vocabulary item contributes exactly two cards.
5. No more than two cards may share the same vocabulary-item ID.
6. Randomize the final arrangement of all cards.

### 6.3 Classic Duplicate Prevention

The game generator must exclude any vocabulary item or pair that would create duplicate visible card content on the board.

A Classic board may not contain:

- Duplicate normalized target-language text.
- Duplicate normalized definition text.
- Duplicate audio filenames.
- Duplicate image filenames.
- More than two cards from the same vocabulary-item ID.

If two vocabulary items share identical target-language text, only one may appear in a generated game, even if the chosen displayed cards are definitions, audio, or images.

---

## 7. Relationship Mode Generation

Relationship modes are:

- Synonyms
- Antonyms
- Generic/Specific
- Whole/Part

### 7.1 Relationship Card Rules

For relationship modes:

- Cards may contain only target-language text or target-language audio.
- Definitions and images are not valid relationship-mode cards.
- Each vocabulary item independently selects one available target-language representation.
- If both target-language text and target-language audio are present, choose one with equal probability.
- These representation combinations are all valid:
  - target text ↔ target text;
  - target text ↔ target audio;
  - target audio ↔ target audio.

### 7.2 Relationship Generation Rules

For a relationship-mode game:

1. Find all lexical-relationship mappings of the currently selected relationship type.
2. Remove mappings that cannot generate valid target-language cards.
3. Randomly select a non-overlapping set of valid relationship mappings.
4. Each selected relationship mapping generates exactly one pair.
5. A vocabulary-item ID may appear in at most one relationship pair in a game.
6. A relationship mapping can only be selected if neither connected vocabulary-item ID has already been used in another selected relationship pair.
7. Treat every relationship mapping as bidirectional for game generation.
8. Randomize the final arrangement of all generated cards.

Example relationship mappings:

```text
A ↔ B
A ↔ C
D ↔ E
```

Valid game selection:

```text
A ↔ B
D ↔ E
```

Invalid game selection:

```text
A ↔ B
A ↔ C
```

The invalid selection is prohibited because vocabulary item `A` would appear in two game pairs.

### 7.3 Pair Count Rules

- The user configures a maximum pair count.
- The app attempts to generate as many valid, non-conflicting pairs as possible up to that maximum.
- If more valid pairs exist than the configured maximum, display exactly the configured maximum.
- If fewer valid pairs exist than the configured maximum but at least two valid pairs are available, display all valid pairs.
- If fewer than two valid pairs exist for the selected game mode, show an insufficient-vocabulary state.
- Do not show an additional informational message when the generated game contains fewer pairs than the configured maximum.

---

## 8. Red Herring

The user may enable one red-herring card in settings.

A red herring:

- Has no matching card.
- Does not count as a valid pair.
- Must be unique against all visible cards in the current board.
- Must not duplicate target text, normalized definition text, audio filename, or image filename already used by another visible card.
- Follows normal mismatch behavior.

### 8.1 Classic Mode Red Herring

In Classic mode:

- Select one element from an unused vocabulary item.
- The red-herring element may be:
  - target-language text;
  - target-language audio;
  - reference-language definition;
  - image.
- The red-herring content must be unique on the board.

### 8.2 Relationship Mode Red Herring

In relationship modes:

- Select target-language text or target-language audio from a vocabulary item not used in any selected relationship pair.
- The selected content must be unique on the board.

### 8.3 Red-Herring Interactions

#### Memory Style

If the red herring is selected as part of a two-card attempt:

1. Treat the selection as a mismatch.
2. Wait until the last selected audio file finishes.
3. Wait an additional four seconds.
4. Flip the red herring and the other selected card back simultaneously.

#### Match Style

If the red herring is selected as part of a two-card selection:

1. Treat the selection as a mismatch.
2. Keep both cards selected for `0.5` seconds.
3. Shake both cards.
4. Subtract `1` point.
5. Deselect both cards.

---

## 9. Settings and Game Controls

A settings gear icon must always be available near the game board.

A restart-arrow icon must appear beside the settings gear after the user completes at least one complete turn or two valid card selections.

### 9.1 Settings Controls

The settings panel must allow the user to:

1. Select game style:
   - Memory
   - Match

2. Select game mode:
   - Classic
   - Synonyms
   - Antonyms
   - Generic/Specific
   - Whole/Part

3. Set maximum pairs:
   - Number input.
   - Minimum value: `2`.
   - Maximum value: `20`.
   - The game attempts to generate up to this maximum.

4. Enable or disable one red herring.

5. Open the dedicated Vocabulary view.

### 9.2 Settings Behavior

- The settings gear remains available during an active game.
- If the user opens and closes settings without modifying a setting, continue the active game unchanged.
- If the user changes any game setting:
  - immediately discard the active game;
  - immediately generate and display a new game using the new settings;
  - reset turns and score.
- Do not require a separate Apply or Start button.

### 9.3 Restart Behavior

- Restart is unavailable until the user completes one full turn or two valid card selections.
- Selecting restart must:
  - immediately discard the active game;
  - reset turns and score;
  - generate a new randomized game using the current settings;
  - require no confirmation.

---

## 10. Vocabulary Management

Vocabulary management is accessible through a dedicated **Vocabulary** view inside the settings panel.

The Vocabulary view must allow the user to:

- Add vocabulary items.
- Edit vocabulary items.
- Delete vocabulary items.
- Add lexical relationships.
- Edit lexical relationships.
- Delete lexical relationships.
- View uploaded audio/image filenames when editing a vocabulary item.

### 10.1 Add/Edit Vocabulary Form

The add/edit form must include:

1. **Target-language text**
   - Text field.
   - Optional if target-language audio is present.

2. **Target-language audio**
   - File upload control.
   - Optional if target-language text is present.

3. **Reference-language definition**
   - Text field.
   - Optional.

4. **Image**
   - File upload control.
   - Optional.

5. **Lexical relationship type**
   - Dropdown options:
     - Synonym
     - Antonym
     - Generic/Specific
     - Whole/Part

6. **Related vocabulary item**
   - Display after selecting a relationship type.
   - Dropdown containing existing vocabulary items.
   - Each option displays target-language text and reference-language definition when available.

7. **Add another relationship**
   - Display a plus button when one or more relationships are already present.
   - Allow multiple relationships in one add/edit session.

8. **Save**
   - Validate the vocabulary item and relation mappings.
   - Save the vocabulary item and valid mappings atomically.

9. **Cancel**
   - Close without saving changes.

### 10.2 Add/Edit Validation

A vocabulary item cannot be saved unless it:

- Contains at least one target-language element.
- Contains at least two total elements.
- Uses supported media file types.
- Meets audio file size and duration requirements.
- Meets image processing requirements.
- Does not violate item-level duplicate validation requirements.

If an edit would make an existing vocabulary item invalid:

- Do not save the edit.
- Retain entered form data.
- Show a clear validation message.
- Prompt the user to add required content or delete the vocabulary item instead.

### 10.3 Creating Relationships During New Item Creation

When adding a new vocabulary item with one or more relationships:

1. Allow the user to configure relationship mappings before saving.
2. Validate the vocabulary item.
3. Validate relation selections.
4. Save the new vocabulary item and relation mappings together.
5. If validation fails:
   - retain form data;
   - do not create the vocabulary item;
   - do not create incomplete relation mappings.

### 10.4 Relationship Validation Rules

- Lexical relationships must connect vocabulary-item IDs, not text strings.
- Self-relations are not allowed.
- Duplicate mappings of the same relationship type between the same two vocabulary items are not allowed, regardless of order.

The following mappings are duplicates:

```text
rápido ↔ veloz, Synonym
veloz ↔ rápido, Synonym
```

- The same two vocabulary items may have multiple different relationship types.
- A vocabulary item may have multiple relationships of the same type.
- Deleting a vocabulary item must automatically remove every lexical relationship mapping that references that item.

---

## 11. Duplicate Detection and Text Normalization

### 11.1 Text Normalization

For duplicate detection and board-content uniqueness, normalize text by:

1. Converting text to a common case.
2. Trimming leading and trailing whitespace.
3. Collapsing repeated interior whitespace.

Do not remove, convert, or normalize diacritics.

Examples:

```text
"Fast"       = "fast"
" fast "     = "fast"
"fast   car" = "fast car"

"café"       ≠ "cafe"
```

### 11.2 Duplicate Vocabulary Items

The library may contain separate vocabulary items with identical target-language text if at least one other field differs.

Examples:

```text
banco → bank
banco → bench
```

```text
hola + audio file A
hola + audio file B
```

However, a generated game board may not include two vocabulary items with duplicate normalized target-language text, even if the cards displayed from those items use different elements.

### 11.3 Media Duplicate Rules

- Compare audio and image content using stored uploaded filenames.
- Do not display audio or image filenames on game cards.
- Preserve filenames as vocabulary-item metadata.
- Show filenames only in the edit-vocabulary-item interface.
- Do not generate a game board with duplicate audio filenames or duplicate image filenames.

---

## 12. Media Requirements

## 12.1 Image Upload and Processing

Supported image formats:

- JPEG
- PNG
- WebP
- HEIC

Image processing requirements:

- Resize images so the longest dimension is no greater than `600px`.
- Compress and store processed images locally as blobs.
- Store processed images as WebP when supported.
- Fall back to JPEG when WebP output is not supported.
- The implementation may choose an appropriate compression quality.
- Do not retain original, unprocessed image files.

HEIC handling:

- Attempt to process HEIC only when supported by the current browser.
- If HEIC cannot be processed, show this message:

```text
HEIC is not supported by this browser.
```

## 12.2 Audio Upload

Supported audio formats:

- MP3
- WAV
- M4A
- OGG
- WebM

Audio requirements:

- Maximum file size: `1 MB`.
- Maximum duration: `30 seconds`.
- Reject audio files larger than `1 MB`.
- Reject audio files longer than `30 seconds`.
- Do not transcode or compress audio in the MVP.
- Do not support microphone recording.
- Store accepted audio files locally as blobs.
- Preserve the original file name as metadata for edit-screen display and duplicate detection.

## 12.3 Storage Failure Handling

If an item, image, or audio file cannot be saved because of browser storage limits or another local persistence error:

- Retain entered form data in memory.
- Do not discard selected media or text.
- Display a clear recoverable error.
- Allow the user to remove/change media or retry saving.

---

## 13. Local Persistence

The app is hosted on GitHub Pages and stores all user data locally in the browser.

Persist:

- Vocabulary-item records.
- Stable vocabulary-item IDs.
- Target-language text.
- Reference-language definitions.
- Audio metadata and blobs.
- Image metadata and processed image blobs.
- Lexical-relationship mappings.
- Vocabulary-library state.

Do not persist:

- Active game progress.
- Current generated board.
- Card order.
- Turn count.
- Match score.
- Currently selected cards.
- Active card flip/reveal state.
- Current game settings in exported backups.

After browser refresh:

- Preserve the vocabulary library and lexical relationships.
- Do not preserve active game state.
- Generate a new game using current runtime/default settings.

---

## 14. Import and Export

The app must support full local-data export and import.

## 14.1 Export

Export must generate a downloadable ZIP archive.

Recommended archive structure:

```text
metadata.json
vocabulary-items.json
lexical-relations.json
media/
  images/
  audio/
```

The export must include:

- All vocabulary-item fields.
- Stable vocabulary-item IDs.
- All lexical-relationship mappings.
- Processed/compressed stored image files.
- Stored audio files.
- Media filenames and MIME metadata.

The export must not include:

- Current game settings.
- Current generated game state.
- Active game progress.
- Original preprocessed image files.
- Historical statistics.

## 14.2 Import

Import must accept a ZIP archive produced by this app.

Import must:

- Parse vocabulary items, lexical relationships, media blobs, metadata, and IDs.
- Validate imported records.
- Restore media attachments and metadata.
- Restore lexical-relationship mappings.

## 14.3 Import Conflicts

If an imported vocabulary item has the same ID as an existing local item but differs in one or more fields, prompt the user to choose one option:

1. **Keep existing**
   - Keep the existing local item.
   - Do not import the conflicting item.

2. **Keep imported**
   - Replace the existing local item with the imported item.

3. **Keep both**
   - Preserve both items.
   - Assign a new unique item ID to one item.

If **Keep both** assigns a new ID to an imported item:

- Update all imported lexical-relationship mappings that reference the original imported ID.
- Preserve lexical-relationship integrity after import.

---

## 15. Layout and Visual Design

### 15.1 Visual Direction

Use `Memory-Match-reference.png` as the visual reference.

The game interface should include:

- A centered game title.
- A moves counter in Memory style.
- A score display in Match style.
- A centered, compact game board.
- Evenly sized cards.
- Pale gray/blue card interiors.
- Thin, subtle colored card borders.
- Settings gear icon near the board.
- Restart-arrow icon beside the settings gear once restart becomes available.

### 15.2 Responsive Layout

- Support desktop and mobile browser layouts.
- On narrow mobile screens, instruct users to rotate the device to landscape orientation.
- Use CSS Grid or equivalent responsive layout behavior.
- Attempt to maintain a square or near-square card grid.
- Limit cards per row based on available viewport width.
- When a red herring is enabled, prefer a layout with one more row than columns when practical.
- Allow empty/inactive grid cells when required to preserve a balanced grid shape.

Empty/inactive cells must:

- preserve the game-board background;
- have no card outline;
- not be selectable;
- not represent missing cards;
- not count as red herrings.

### 15.3 Card Presentation

- Cards must use a fixed aspect ratio.
- Card content must shrink to fit.
- Long definitions must wrap before text is reduced in size.
- Images should use a contain-style layout so the complete image is visible.
- Audio cards must display a clear play/replay control.
- Audio and image filenames must not appear on game cards.
- Cards must have distinct visual states:
  - hidden;
  - revealed;
  - selected;
  - matched;
  - incorrect;
  - removed;
  - disabled.

### 15.4 Required Animations

Use CSS-based animations where practical.

| Animation | Requirement |
|---|---|
| Card reveal | Horizontal flip when a Memory card is selected |
| Card hide | Horizontal flip back for mismatched Memory cards |
| Correct match | Brief green outline/pulse before cards remain revealed or disappear |
| Incorrect match | Approximately 5-degree left/right shake repeated several times quickly |
| Match removal | Correct Match-style cards disappear after success animation |

### 15.5 User Preferences

Provide user settings to disable:

- Game sound effects.
- Nonessential animations.

Vocabulary-item target audio remains part of the game and is not controlled by the game-sound-effects setting.

---

## 16. Insufficient Vocabulary State

When fewer than two valid, non-conflicting pairs are available for the selected game mode:

- Do not render an interactive game board.
- Display an insufficient-vocabulary message in the playfield.
- Display a direct action such as **Add vocabulary**.
- Open the Vocabulary view when the direct action is selected.

Example Classic message:

```text
Classic mode requires at least two valid vocabulary pairs.
Add more vocabulary to begin playing.
```

Example relationship-mode message:

```text
Antonym mode requires at least two valid antonym relationships.
Add vocabulary and antonym relationships to begin playing.
```

If at least two valid pairs exist but fewer than the configured maximum:

- Start the game with all available valid pairs.
- Do not display a reduced-pair-count message.

---

## 17. Recommended Technical Approach

Build a static client-side application compatible with GitHub Pages.

### 17.1 Recommended Stack

- React
- TypeScript
- Vite
- IndexedDB for local structured data and media blobs
- Dexie or equivalent IndexedDB wrapper
- JSZip for ZIP import/export
- Browser Canvas and image APIs for image resize/compression
- CSS Grid for responsive card layout
- CSS transforms and keyframes for flip, shake, and success animations
- Vitest for unit tests
- Playwright for interaction and browser tests
- GitHub Actions for build and GitHub Pages deployment

### 17.2 Core Persistent Entities

```ts
type VocabularyItem = {
  id: string;
  targetText?: string;
  targetTextComparisonKey?: string;
  definition?: string;
  definitionComparisonKey?: string;
  audioAssetId?: string;
  imageAssetId?: string;
  createdAt: string;
  updatedAt: string;
};

type MediaAsset = {
  id: string;
  vocabularyItemId: string;
  type: "audio" | "image";
  blob: Blob;
  fileName: string;
  mimeType: string;
  fileSize: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  createdAt: string;
};

type LexicalRelation = {
  id: string;
  itemAId: string;
  itemBId: string;
  type: "synonym" | "antonym" | "genericSpecific" | "wholePart";
  createdAt: string;
};
```

### 17.3 Runtime Game Entities

```ts
type GameSettings = {
  gameStyle: "memory" | "match";
  gameMode:
    | "classic"
    | "synonym"
    | "antonym"
    | "genericSpecific"
    | "wholePart";
  maxPairs: number;
  redHerringEnabled: boolean;
  soundEffectsEnabled: boolean;
  animationsEnabled: boolean;
};

type CardRepresentation =
  | "targetText"
  | "targetAudio"
  | "definition"
  | "image";

type CardState =
  | "hidden"
  | "revealed"
  | "selected"
  | "matched"
  | "incorrect"
  | "removed"
  | "disabled";

type GeneratedCard = {
  id: string;
  itemId: string;
  relationId?: string;
  representation: CardRepresentation;
  contentKey: string;
  isRedHerring: boolean;
  state: CardState;
};

type GeneratedPair = {
  id: string;
  itemId?: string;
  relationId?: string;
  cardAId: string;
  cardBId: string;
};

type GameState = {
  settings: GameSettings;
  cards: GeneratedCard[];
  pairs: GeneratedPair[];
  selectedCardIds: string[];
  matchedPairIds: string[];
  turnCount: number;
  score: number;
  isLocked: boolean;
  isComplete: boolean;
};
```

---

## 18. Acceptance Criteria

### 18.1 Vocabulary and Relationships

- A user can save a vocabulary item containing target text and a definition.
- A user can save a vocabulary item containing target audio and an image.
- A user cannot save an item containing only target text.
- A user cannot save an item containing only target audio.
- A user cannot save an item containing only a definition and image.
- A user can upload supported image and audio file types.
- The app rejects audio uploads larger than `1 MB`.
- The app rejects audio uploads longer than `30 seconds`.
- The app resizes saved images to a maximum longest dimension of `600px`.
- The app stores processed images as WebP where supported and JPEG otherwise.
- A user can create multiple lexical relationships for an item.
- A user cannot create a self-relationship.
- A user cannot create duplicate mappings of the same type between the same two item IDs.
- Deleting a vocabulary item removes every lexical relationship mapping that references that item.

### 18.2 Game Generation

- Classic mode creates exactly one pair for each selected vocabulary item.
- Every Classic pair includes target-language text or target-language audio.
- Relationship modes create cards only from target-language text and target-language audio.
- No relationship-mode board includes a vocabulary item in more than one pair.
- No board contains duplicate normalized target-language text.
- No board contains duplicate normalized definition text.
- No board contains duplicate audio filenames.
- No board contains duplicate image filenames.
- A red herring never duplicates another visible card.
- The app generates up to the configured maximum number of pairs.
- The app uses all available valid pairs when fewer than the configured maximum are available but at least two pairs exist.
- The app shows insufficient-vocabulary state when fewer than two valid pairs exist.

### 18.3 Gameplay

- Memory turns increase only after the second valid card is selected.
- A correct Memory pair remains revealed and disabled.
- An incorrect Memory pair flips back after the final selected audio ends plus four seconds.
- A correct Match pair gains one point and disappears after success animation.
- An incorrect Match pair waits 0.5 seconds, shakes, loses one point, and deselects.
- Match score can become negative.
- Red herrings always follow mismatch behavior.
- Restart appears after the user completes one full turn/two selections.
- Restart generates a new randomized game without confirmation.
- Play again is shown when the game completes.

### 18.4 Persistence and Transfer

- Vocabulary items, lexical relationships, and processed media remain available after browser refresh.
- Active game state does not persist after browser refresh.
- A user can export all vocabulary, relationship mappings, processed images, and audio as a ZIP archive.
- A user can import a valid archive exported by the application.
- Import conflict resolution supports:
  - keeping existing;
  - keeping imported;
  - keeping both with a new ID and updated relationship mappings.
```