/// Type-state marker indicating the parser has been created but not initialized with an arena.
pub struct Uninitialized;

/// Type-state marker indicating the parser has been initialized and is ready to parse.
pub struct Ready;

/// Type-state marker indicating the parser is currently parsing a document.
pub struct Parsing;

/// Type-state marker indicating the parser has successfully completed parsing.
pub struct Complete;

/// Type-state marker indicating the parser encountered an error during parsing.
pub struct Failed;
