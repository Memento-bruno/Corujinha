"use client";

import { MonthSwitcher } from "../shell/month-switcher";
import { CardsSection } from "./cards-section";
import { HealthGauge } from "./health-gauge";
import { InstallmentsChart } from "./installments-chart";
import { KpiGrid } from "./kpi-grid";
import { RecurringList } from "./recurring-list";
import { SectorBreakdown } from "./sector-breakdown";
import { SpendingChart } from "./spending-chart";

export function HomeView() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-base font-semibold text-zinc-900">Visão geral</h2>
        <MonthSwitcher />
      </div>
      <KpiGrid />
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0 space-y-4">
          <CardsSection />
          <SpendingChart />
          <InstallmentsChart />
        </div>
        <div className="min-w-0 space-y-4">
          <HealthGauge />
          <SectorBreakdown />
          <RecurringList />
        </div>
      </div>
    </div>
  );
}
