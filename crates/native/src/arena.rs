use bumpalo::Bump;
use rustc_hash::FxHashSet;
use std::cell::RefCell;

pub struct Arena {
    bump: Bump,
    interned: RefCell<FxHashSet<&'static str>>,
}

impl Arena {
    #[inline]
    pub fn new() -> Self {
        Self {
            bump: Bump::new(),
            interned: RefCell::new(FxHashSet::default()),
        }
    }

    #[inline]
    pub fn allocator(&self) -> &Bump {
        &self.bump
    }

    #[inline]
    pub fn alloc<T>(&self, value: T) -> &T {
        self.bump.alloc(value)
    }

    #[inline]
    pub fn alloc_vec<T>(&self) -> bumpalo::collections::Vec<'_, T> {
        bumpalo::collections::Vec::new_in(&self.bump)
    }

    pub fn intern(&self, s: &str) -> &str {
        let mut interned = self.interned.borrow_mut();

        if let Some(&existing) = interned.get(s) {
            return existing;
        }

        let allocated = self.bump.alloc_str(s);

        // SAFETY: This lifetime extension from the arena's lifetime to 'static is sound because:
        // 1. The memory is allocated in the bump allocator owned by this Arena
        // 2. The bump allocator never moves or frees allocated memory until the Arena is dropped
        // 3. The string is only stored internally in the FxHashSet with a 'static lifetime
        // 4. The public API returns &str with the Arena's lifetime (not 'static), maintaining proper borrow checking
        // 5. The Arena's Drop implementation will clean up all memory, including this string
        //
        // This pattern is safe and commonly used in arena allocators for string interning.
        let static_str = unsafe { std::mem::transmute::<&str, &'static str>(allocated) };

        interned.insert(static_str);
        static_str
    }
}

impl Default for Arena {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_allocation() {
        let arena = Arena::new();

        let num = arena.alloc(42);
        assert_eq!(*num, 42);
    }

    #[test]
    fn test_string_interning_returns_same_pointer() {
        let arena = Arena::new();

        let s1 = arena.intern("hello");
        let s2 = arena.intern("hello");

        assert_eq!(s1, s2);
        assert!(std::ptr::eq(s1, s2));
    }

    #[test]
    fn test_different_strings_have_different_pointers() {
        let arena = Arena::new();

        let s1 = arena.intern("hello");
        let s2 = arena.intern("world");

        assert_ne!(s1, s2);
        assert!(!std::ptr::eq(s1, s2));
    }

    #[test]
    fn test_vec_allocation() {
        let arena = Arena::new();

        let mut vec = arena.alloc_vec();
        vec.push(1);
        vec.push(2);
        vec.push(3);

        assert_eq!(vec.len(), 3);
        assert_eq!(vec[0], 1);
        assert_eq!(vec[2], 3);
    }

    #[test]
    fn test_multiple_interned_strings() {
        let arena = Arena::new();

        let type1 = arena.intern("User");
        let type2 = arena.intern("Post");
        let type3 = arena.intern("User");

        assert!(std::ptr::eq(type1, type3));
        assert!(!std::ptr::eq(type1, type2));
    }

    #[test]
    fn test_complex_nested_structure() {
        let arena = Arena::new();

        let outer = arena.alloc(vec![
            arena.intern("field1"),
            arena.intern("field2"),
            arena.intern("field1"),
        ]);

        assert_eq!(outer.len(), 3);
        assert!(std::ptr::eq(outer[0], outer[2]));
    }
}
