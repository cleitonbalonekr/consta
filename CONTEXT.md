# Consta

Consta helps a lawyer understand one very large Brazilian case file by answering questions in which every statement cites the page that supports it.

## Language

### Case files

**Case file**:
The complete PDF of one lawsuit (the autos) that a lawyer uploads, usually exported from PJe or e-SAJ. Each upload is a separate case file, even a newer download of the same lawsuit.
_Avoid_: document, PDF, process, processo

**Peça**:
One document inside a case file, such as a petição inicial, contestação, sentença or laudo.
_Avoid_: document, section, part, attachment

**Peça type**:
The legal category of a peça: petição inicial, contestação, despacho, decisão, sentença, acórdão, laudo, and so on.
_Avoid_: kind, category

**Page**:
One page of a case file, numbered by its position in the uploaded PDF, starting at 1.
_Avoid_: sheet

**Folha**:
The sheet number a court stamped on a page ("fls."), which can differ from the page number.
_Avoid_: page (when the stamped number is meant)

**Digital page**:
A page whose text was produced by a court system and can be read directly.

**Scanned page**:
A page that is an image (a scan, a photo, handwriting) and must be read by OCR. The MVP does not read it: it marks the page as not read, and no statement can cite it (ADR-0010).
_Avoid_: image page

**Document map**:
The ordered list of the peças in a case file, each with its type, date, page range and summary.
_Avoid_: index, table of contents, TOC

**Fact**:
A person, role, date, amount or event stated in a case file, recorded with the page it comes from.
_Avoid_: entity, metadata, data point

**Ingestion**:
The one-time work that turns an uploaded case file into readable pages, a document map and facts.
_Avoid_: processing, indexing, import

### Questions and answers

**Question**:
What a lawyer asks about one case file, within one scope.

**Scope**:
What a question is about: the whole case file, or one peça.
_Avoid_: mode, context, filter

**Quick action**:
A preset question answered from facts: the timeline, the people involved, or the amounts.
_Avoid_: shortcut, template, preset

**Answer**:
The response to a question, made only of statements.

**Statement**:
One claim in an answer. A statement is shown only when it has at least one citation.
_Avoid_: sentence, claim

**Citation**:
The link from a statement to the page, and the quoted text on that page, that supports it. It always names the page and also names the folha when the page has one.
_Avoid_: page reference, reference, source, footnote

### People and plans

**Lawyer**:
The person who signs in, uploads case files and asks questions. A lawyer owns their case files.
_Avoid_: user, customer, client (a client is the lawyer's own client)

**Plan**:
What a lawyer pays for: Trial, Pro or Enterprise.
_Avoid_: tier, subscription

**Page quota**:
The number of pages a lawyer's plan allows them to ingest each month. Pages count once ingested, even if the case file is deleted later. A case file whose ingestion fails gives its pages back.
_Avoid_: credits, limit
