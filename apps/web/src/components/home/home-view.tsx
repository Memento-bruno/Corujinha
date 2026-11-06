"use client";

import { BillsCard } from "./bills-card";
import { CardsStrip } from "./cards-strip";
import { CategoriesCard } from "./categories-card";
import { CompositionChart } from "./composition-chart";
import { DueDates } from "./due-dates";
import { EvolutionChart } from "./evolution-chart";
import { HealthCard } from "./health-card";
import { InboxCard } from "./inbox-card";
import { SpendHero } from "./spend-hero";

export function HomeView() {
  return (
    <div className="flex flex-col gap-5">
      <DueDates />
      <InboxCard />
      <SpendHero />
      <div className="flex flex-wrap gap-5">
        <EvolutionChart />
        <HealthCard />
      </div>
      <CardsStrip />
      <CompositionChart />
      <div className="flex flex-wrap gap-5">
        <CategoriesCard />
        <BillsCard />
      </div>
    </div>
  );
}
