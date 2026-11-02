"use client";

import { useState } from "react";
import { companyHue, companyName } from "../lib/companies";
import type { Facet, ListFilter } from "../lib/filter";
import { EMPTY_FILTER } from "../lib/filter";
import { flip } from "../lib/storage";

interface Props {
  filter: ListFilter;
  setFilter: (f: (prev: ListFilter) => ListFilter) => void;
  companies: Facet[];
  cities: Facet[];
  active: boolean;
}

const CITY_FOLD = 10;

export function FilterBar({ filter, setFilter, companies, cities, active }: Props) {
  const [allCities, setAllCities] = useState(false);
  const toggle = (k: "companies" | "cities", v: string) => setFilter((f) => ({ ...f, [k]: flip(f[k], v) }));

  return (
    <section className="panel" role="search" aria-label="检索与筛选">
      <div className="panel-head">
        <span className="step">3</span>
        <h2>检索岗位</h2>
        {active && (
          <button className="link-btn" style={{ marginLeft: "auto" }} onClick={() => setFilter(() => EMPTY_FILTER)}>
            清除全部筛选
          </button>
        )}
      </div>

      <div className="filters">
        <input
          className="input search"
          type="text"
          placeholder="搜索岗位、公司、城市或职责关键词（空格分隔，需全部命中）"
          aria-label="搜索岗位"
          value={filter.query}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
        />

        <div className="filter-row">
          <span className="lbl">公司</span>
          <div className="chips">
            {companies.map(({ value, count }) => (
              <button
                key={value}
                className="chip"
                aria-pressed={filter.companies.includes(value)}
                onClick={() => toggle("companies", value)}
              >
                <span className="dot" style={{ background: `hsl(${companyHue(value)} 65% 52%)` }} />
                {companyName(value)} <span className="n">{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="filter-row">
          <span className="lbl">城市</span>
          <div className="chips">
            {(allCities ? cities : cities.slice(0, CITY_FOLD)).map(({ value, count }) => (
              <button
                key={value}
                className="chip"
                aria-pressed={filter.cities.includes(value)}
                onClick={() => toggle("cities", value)}
              >
                {value} <span className="n">{count}</span>
              </button>
            ))}
            {cities.length > CITY_FOLD && (
              <button className="chip" onClick={() => setAllCities((v) => !v)}>
                {allCities ? "收起" : `更多 ${cities.length - CITY_FOLD} 个`}
              </button>
            )}
          </div>
        </div>

        <div className="filter-row">
          <span className="lbl">其他</span>
          <div className="chips">
            <button
              className="chip"
              aria-pressed={filter.onlySelected}
              onClick={() => setFilter((f) => ({ ...f, onlySelected: !f.onlySelected }))}
            >
              只看已选
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
