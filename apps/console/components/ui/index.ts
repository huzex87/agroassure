// One entry point, so a page imports from "../components/ui" whether the thing
// it wants came from the shadcn registry or was written for this product.
//
// ./chart is deliberately not re-exported here. It pulls in Recharts, and a
// barrel that every page imports would put a hundred kilobytes of charting into
// the facilities table, the findings worklist and the sign-in page — none of
// which draw anything. Import it from "@/components/ui/chart" where it is
// actually used, which in practice means components/charts.tsx.

export * from "./badge";
export * from "./button";
export * from "./card";
export * from "./progress";
export * from "./separator";
export * from "./skeleton";
export * from "./table";
export * from "./primitives";
