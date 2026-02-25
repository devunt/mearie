# @mearie/native

## 0.2.0

### Minor Changes

- ccfabf9: Add `@required` directive support with `THROW` and `CASCADE` actions for client-side null handling. `THROW` throws `RequiredFieldError` when a required field is null; `CASCADE` propagates null to the nearest nullable ancestor.

### Patch Changes

- bbb9412: Fix `@required` directive not being stripped from fragment sources included in operation body
- b8df747: Allow GraphQL keywords as identifiers in all parser contexts, per the GraphQL specification.

## 0.1.0

### Minor Changes

- cf2f4e0: Version packages
