use insta::Settings;

pub struct SnapshotBuilder {
    settings: Settings,
}

impl SnapshotBuilder {
    pub fn new() -> Self {
        Self {
            settings: Settings::clone_current(),
        }
    }

    pub fn with_description(mut self, desc: &str) -> Self {
        self.settings.set_description(desc);
        self
    }

    pub fn with_info(mut self, info: &dyn std::fmt::Display) -> Self {
        self.settings.set_info(info);
        self
    }

    pub fn with_omit_expression(mut self, omit: bool) -> Self {
        self.settings.set_omit_expression(omit);
        self
    }

    pub fn snapshot(self, name: &str, value: &impl std::fmt::Debug) {
        self.settings.bind(|| {
            insta::assert_debug_snapshot!(name, value);
        });
    }

    pub fn snapshot_str(self, name: &str, value: &str) {
        self.settings.bind(|| {
            insta::assert_snapshot!(name, value);
        });
    }
}

#[macro_export]
macro_rules! snapshot_test {
    ($name:expr, $value:expr) => {
        $crate::common::SnapshotBuilder::new()
            .snapshot($name, &$value)
    };

    ($name:expr, $value:expr, $desc:expr) => {
        $crate::common::SnapshotBuilder::new()
            .with_description($desc)
            .snapshot($name, &$value)
    };
}
