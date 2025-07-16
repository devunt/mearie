use std::fs;
use std::path::{Path, PathBuf};

pub struct FixtureLoader {
    base_path: PathBuf,
}

impl FixtureLoader {
    pub fn new() -> Self {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        Self {
            base_path: Path::new(manifest_dir).join("fixtures"),
        }
    }

    pub fn load_schema(&self, name: &str) -> String {
        self.load_file(&format!("graphql/schemas/{}.graphql", name))
    }

    pub fn load_operation(&self, name: &str) -> String {
        self.load_file(&format!("graphql/operations/{}.graphql", name))
    }

    pub fn load_invalid_schema(&self, name: &str) -> String {
        self.load_file(&format!("graphql/schemas/invalid/{}.graphql", name))
    }

    pub fn load_invalid_operation(&self, name: &str) -> String {
        self.load_file(&format!("graphql/operations/invalid/{}.graphql", name))
    }

    pub fn all_schemas(&self) -> Vec<(String, String)> {
        self.load_all_from("graphql/schemas")
            .into_iter()
            .filter(|(name, _)| !name.starts_with("invalid"))
            .collect()
    }

    pub fn all_operations(&self) -> Vec<(String, String)> {
        self.load_all_from("graphql/operations")
            .into_iter()
            .filter(|(name, _)| !name.starts_with("invalid"))
            .collect()
    }

    fn load_file(&self, path: &str) -> String {
        let full_path = self.base_path.join(path);
        fs::read_to_string(&full_path)
            .unwrap_or_else(|_| panic!("Failed to load fixture: {}", full_path.display()))
    }

    fn load_all_from(&self, subdir: &str) -> Vec<(String, String)> {
        let dir = self.base_path.join(subdir);

        if !dir.exists() {
            return Vec::new();
        }

        fs::read_dir(&dir)
            .unwrap()
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let path = entry.path();
                if path.is_file() && path.extension()? == "graphql" {
                    let name = path.file_stem()?.to_str()?.to_string();
                    let content = fs::read_to_string(&path).ok()?;
                    Some((name, content))
                } else {
                    None
                }
            })
            .collect()
    }
}

pub fn fixtures() -> &'static FixtureLoader {
    static LOADER: std::sync::OnceLock<FixtureLoader> = std::sync::OnceLock::new();
    LOADER.get_or_init(FixtureLoader::new)
}
