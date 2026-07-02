from __future__ import annotations

from .config import editions


def _to_int(value) -> int | None:
    if value in ("", None):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _primary_position(positions: str) -> str:
    token = str(positions or "").split(",")[0].strip().upper()
    if token in {"GK"}:
        return "GK"
    if token in {"CB", "LB", "RB", "LWB", "RWB", "LCB", "RCB"}:
        return "DEF"
    if token in {"CDM", "CM", "CAM", "LM", "RM", "LAM", "RAM", "LCM", "RCM", "LDM", "RDM"}:
        return "MID"
    return "FWD"


def analyze_squad(players: list[dict]) -> dict:
    if not players:
        return {
            "count": 0,
            "avgAge": None,
            "avgOverall": None,
            "best11Overall": None,
            "subsOverall": None,
            "avgPotential": None,
            "youthCount": 0,
            "veteranCount": 0,
            "starCount": 0,
            "prospectCount": 0,
            "totalSquadValue": 0,
            "totalWageBill": 0,
            "topValue": 0,
            "topWage": 0,
            "medianWage": 0,
            "positionMix": {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0},
            "dominantNationalities": [],
            "nationalityCount": 0,
            "nationalityCounts": {},
            "youngUnder23Count": 0,
            "seniorOver32Count": 0,
        }

    ages: list[int] = []
    overalls: list[int] = []
    nationality_samples: list[str] = []
    potentials: list[int] = []
    values: list[int] = []
    wages: list[int] = []
    position_mix = {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0}

    for player in players:
        age = _to_int(player.get("age"))
        overall = _to_int(player.get("overall"))
        potential = _to_int(player.get("potential"))
        value = _to_int(player.get("value")) or 0
        wage = _to_int(player.get("wage")) or 0

        if age is not None:
            ages.append(age)
        if overall is not None:
            overalls.append(overall)
        nat = str(player.get("nationality") or "").strip()
        if nat and nat.lower() != "nan":
            nationality_samples.append(nat)
        if potential is not None:
            potentials.append(potential)
        values.append(value)
        wages.append(wage)
        position_mix[_primary_position(player.get("positions", ""))] += 1

    youth_count = sum(1 for age in ages if age <= 21)
    veteran_count = sum(1 for age in ages if age >= 30)
    young_under_23_count = sum(1 for age in ages if age < 23)
    senior_over_32_count = sum(1 for age in ages if age > 32)
    star_count = sum(1 for overall in overalls if overall >= 85)
    prospect_count = sum(
        1
        for overall, potential in zip(overalls, potentials, strict=False)
        if potential is not None and overall is not None and potential - overall >= 8
    )

    sorted_wages = sorted(wages)
    median_wage = sorted_wages[len(sorted_wages) // 2] if sorted_wages else 0

    overalls_sorted = sorted(overalls, reverse=True) if overalls else []
    best11 = overalls_sorted[:11]
    subs = overalls_sorted[11:]
    best11_overall = round(sum(best11) / len(best11)) if best11 else None
    subs_overall = round(sum(subs) / len(subs)) if subs else None

    nationality_counts: dict[str, int] = {}
    for nat in nationality_samples:
        nationality_counts[nat] = nationality_counts.get(nat, 0) + 1

    dominant_nationalities: list[str] = []
    distinct_nats_count = len({nat.casefold() for nat in nationality_counts.keys()}) if nationality_counts else 0

    if nationality_counts:
        dominant_nationalities = [
            nat
            for nat, _
            in sorted(nationality_counts.items(), key=lambda kv: (-kv[1], kv[0].casefold()))[:3]
        ]

    return {
        "count": len(players),
        "avgAge": round(sum(ages) / len(ages), 1) if ages else None,
        "avgOverall": round(sum(overalls) / len(overalls)) if overalls else None,
        "best11Overall": best11_overall,
        "subsOverall": subs_overall,
        "avgPotential": round(sum(potentials) / len(potentials)) if potentials else None,
        "youthCount": youth_count,
        "veteranCount": veteran_count,
        "youngUnder23Count": young_under_23_count,
        "seniorOver32Count": senior_over_32_count,
        "starCount": star_count,
        "prospectCount": prospect_count,
        "totalSquadValue": sum(values),
        "totalWageBill": sum(wages),
        "topValue": max(values) if values else 0,
        "topWage": max(wages) if wages else 0,
        "medianWage": median_wage,
        "positionMix": position_mix,
        "dominantNationalities": dominant_nationalities,
        "nationalityCount": distinct_nats_count,
        "nationalityCounts": nationality_counts,
    }


def _tier_from_overall(avg_overall: int | None) -> str:
    if avg_overall is None:
        return "unknown"
    if avg_overall >= 78:
        return "elite"
    if avg_overall >= 74:
        return "contender"
    if avg_overall >= 70:
        return "midtable"
    return "underdog"


def derive_philosophy(club_name: str, profile: dict, top_players: list[dict]) -> dict:
    avg_age = profile.get("avgAge")
    avg_overall = profile.get("avgOverall")
    best11_overall = profile.get("best11Overall")
    count = profile.get("count") or 1
    tier = _tier_from_overall(best11_overall if best11_overall is not None else avg_overall)

    tags: list[str] = []
    pillars: list[str] = []

    if avg_age is not None and avg_age <= 24.5:
        tags.append("Youth project")
        pillars.append("Promote internal growth and sell high before contracts stall.")
    elif avg_age is not None and avg_age >= 28.5:
        tags.append("Win-now")
        pillars.append("Short window — results matter more than long-term asset building.")
    else:
        tags.append("Balanced squad")
        pillars.append("Blend experienced starters with players still climbing the curve.")

    youth_ratio = profile.get("youthCount", 0) / count
    if youth_ratio >= 0.22:
        tags.append("Academy pipeline")
        pillars.append("Use the youth core to keep wage growth under control.")

    # New counters: young (<23) and senior (>32) balance.
    young_23_ratio = (profile.get("youngUnder23Count", 0) or 0) / count
    senior_32_count = profile.get("seniorOver32Count", 0) or 0
    if young_23_ratio >= 0.25:
        tags.append("Young core")
        pillars.append("Give consistent minutes to under-23 talent to accelerate growth.")
    if senior_32_count >= 4:
        tags.append("Leadership core")
        pillars.append("Treat senior leaders as your stability anchors during transitions.")

    if profile.get("starCount", 0) >= 2:
        tags.append("Star-driven")
        pillars.append("Build around elite match-winners — squad depth supports the talisman.")

    if profile.get("prospectCount", 0) >= 4:
        tags.append("Development club")
        pillars.append("Buy or grow high-potential profiles even if current OVR is uneven.")

    mix = profile.get("positionMix", {})
    forward_share = mix.get("FWD", 0) / count
    if forward_share >= 0.38:
        tags.append("Attack-first")
        pillars.append("Invest in chance creation and finishing — defensive risk is acceptable.")
    elif mix.get("DEF", 0) / count >= 0.38:
        tags.append("Defensive foundation")
        pillars.append("Control games through structure; upgrade only when clear upgrades appear.")

    tier_voice = {
        "elite": f"{club_name} are expected to compete for titles and marquee signings.",
        "contender": f"{club_name} should target Europe and punch up against top-six sides.",
        "midtable": f"{club_name} need smart recruitment to avoid a flat mid-table drift.",
        "underdog": f"{club_name} thrive on low expectations — every cup run becomes a story.",
        "unknown": f"{club_name} lack enough squad data to pin down a clear identity.",
    }

    star_line = ""
    if top_players:
        names = ", ".join(player["name"] for player in top_players[:3])
        star_line = f"On-pitch identity runs through {names}."

    nationality_line = ""
    dom_nats = profile.get("dominantNationalities") or []
    if dom_nats:
        nat_count = profile.get("nationalityCount")
        counts = profile.get("nationalityCounts") or {}
        dom_parts = [f"{nat} ({counts.get(nat) or 0})" for nat in dom_nats[:3]]
        nationality_line = (
            f"The squad’s national identity leans on {', '.join(dom_parts)}"
            f"{f' across {nat_count} nationalities' if nat_count else ''}."
        )

    age_line = ""
    young_under_23 = profile.get("youngUnder23Count")
    senior_over_32 = profile.get("seniorOver32Count")
    if isinstance(young_under_23, int) and isinstance(senior_over_32, int):
        age_line = f"Squad balance: {young_under_23} under 23 and {senior_over_32} over 32."

    summary = " ".join(
        part
        for part in [
            tier_voice[tier],
            star_line,
            age_line,
            nationality_line,
            pillars[0] if pillars else "",
        ]
        if part
    )

    return {
        "title": tags[0] if tags else "Club identity",
        "tags": tags[:4],
        "tier": tier,
        "summary": summary,
        "pillars": pillars[:3],
    }


def derive_budget(profile: dict) -> dict:
    total_value = profile.get("totalSquadValue") or 0
    top_value = profile.get("topValue") or 0
    top_wage = profile.get("topWage") or 0
    median_wage = profile.get("medianWage") or 0
    avg_overall = profile.get("avgOverall")
    tier = _tier_from_overall(avg_overall)

    tier_transfer_floor = {
        "elite": 45_000_000,
        "contender": 22_000_000,
        "midtable": 9_000_000,
        "underdog": 3_000_000,
        "unknown": 5_000_000,
    }[tier]

    tier_wage_floor = {
        "elite": 220_000,
        "contender": 120_000,
        "midtable": 55_000,
        "underdog": 18_000,
        "unknown": 25_000,
    }[tier]

    tier_multiplier = {
        "elite": 0.28,
        "contender": 0.22,
        "midtable": 0.16,
        "underdog": 0.12,
        "unknown": 0.15,
    }[tier]

    if total_value > 0 or top_value > 0:
        suggested_transfer = max(
            int(top_value * 0.85),
            int(total_value * tier_multiplier),
            tier_transfer_floor // 3,
        )
        suggested_wage = max(int(top_wage * 0.75), int(median_wage * 2.5), tier_wage_floor // 2)
        rationale = (
            f"Derived from squad value (€{total_value:,}) and tier ({tier}). "
            f"Target one marquee move or two squad upgrades without breaking the wage structure."
        )
    else:
        suggested_transfer = tier_transfer_floor
        suggested_wage = tier_wage_floor
        rationale = (
            f"Financial data is sparse in this edition — budget is estimated from squad tier ({tier}) "
            f"and average OVR ({avg_overall})."
        )

    return {
        "maxTransfer": max(suggested_transfer, 500_000),
        "maxWage": max(suggested_wage, 5_000),
        "rationale": rationale,
    }


def _player_delta(current_players: list[dict], previous_players: list[dict]) -> dict:
    current_ids = {player["id"] for player in current_players if player.get("id")}
    previous_ids = {player["id"] for player in previous_players if player.get("id")}

    arrivals = [player for player in current_players if player.get("id") not in previous_ids]
    departures = [player for player in previous_players if player.get("id") not in current_ids]

    return {
        "arrivals": arrivals[:5],
        "departures": departures[:5],
        "turnover": len(arrivals) + len(departures),
    }


def derive_era_narrative(
    club_name: str,
    edition: int,
    summary: dict,
    previous_summary: dict | None,
    delta: dict,
) -> dict:
    count = summary.get("count") or 0
    avg_overall = summary.get("avgOverall")
    best11_overall = summary.get("best11Overall")
    headline = f"FIFA {edition} snapshot"

    if count == 0:
        return {
            "edition": edition,
            "headline": f"Not in FIFA {edition}",
            "narrative": f"{club_name} do not appear in the FIFA {edition} dataset.",
            "avgOverall": None,
            "deltaOverall": None,
        }

    prev_avg = previous_summary.get("avgOverall") if previous_summary else None
    delta_overall = avg_overall - prev_avg if avg_overall is not None and prev_avg is not None else None

    if delta_overall is not None:
        if delta_overall >= 2:
            headline = f"FIFA {edition} — squad upgrade"
        elif delta_overall <= -2:
            headline = f"FIFA {edition} — reset phase"
        else:
            headline = f"FIFA {edition} — steady evolution"

    parts: list[str] = []
    if avg_overall is not None:
        parts.append(f"Average squad rating sits at {avg_overall} across {count} players.")
    if best11_overall is not None:
        parts.append(f"Best XI baseline sits at {best11_overall}.")

    if delta_overall is not None:
        direction = "rose" if delta_overall > 0 else "fell" if delta_overall < 0 else "held"
        parts.append(f"Overall level {direction} by {abs(delta_overall)} from the prior edition.")

    if delta.get("arrivals"):
        names = ", ".join(player["name"] for player in delta["arrivals"][:3])
        parts.append(f"New faces included {names}.")

    if delta.get("departures"):
        names = ", ".join(player["name"] for player in delta["departures"][:3])
        parts.append(f"Key exits: {names}.")

    if delta.get("turnover", 0) >= 12:
        parts.append("Heavy squad churn — expect a transitional narrative in career mode.")

    young_under_23 = summary.get("youngUnder23Count")
    senior_over_32 = summary.get("seniorOver32Count")
    if isinstance(young_under_23, int) and isinstance(senior_over_32, int):
        prev_y = (previous_summary or {}).get("youngUnder23Count") if previous_summary else None
        prev_s = (previous_summary or {}).get("seniorOver32Count") if previous_summary else None
        if isinstance(prev_y, int) and isinstance(prev_s, int) and (prev_y != young_under_23 or prev_s != senior_over_32):
            parts.append(
                f"Generation mix shifts: now {young_under_23} under-23 and {senior_over_32} over-32."
            )
        else:
            parts.append(f"Generation mix: {young_under_23} under-23 and {senior_over_32} over-32.")

    current_doms = summary.get("dominantNationalities") or []
    prev_doms = (previous_summary or {}).get("dominantNationalities") or []
    if current_doms:
        if not prev_doms or current_doms[0] != prev_doms[0]:
            nat_count = summary.get("nationalityCount")
            counts = summary.get("nationalityCounts") or {}
            current_dom = current_doms[0]
            current_dom_players = counts.get(current_dom) or 0
            if nat_count:
                parts.append(
                    f"National identity shifts toward {current_dom} ({current_dom_players} players) across {nat_count} nationalities."
                )
            else:
                parts.append(f"National identity shifts toward {current_dom} ({current_dom_players} players).")

    return {
        "edition": edition,
        "headline": headline,
        "narrative": " ".join(parts),
        "avgOverall": avg_overall,
        "deltaOverall": delta_overall,
    }


def derive_board_objectives(philosophy: dict, profile: dict, club_name: str) -> list[dict]:
    tier = philosophy.get("tier", "midtable")
    avg_overall = profile.get("avgOverall")
    best11_overall = profile.get("best11Overall")

    objectives_by_tier = {
        "elite": [
            "Win the league or reach the final stages of Europe.",
            "Keep star players happy — no squad downgrade at key positions.",
            "Add one elite signing that matches the club’s ambition.",
        ],
        "contender": [
            "Secure European football through the league or cups.",
            "Beat at least one direct rival in head-to-head fixtures.",
            "Upgrade the starting XI without bloating the wage bill.",
        ],
        "midtable": [
            "Finish in the upper half and build momentum for next season.",
            "Promote or integrate at least one youth standout.",
            "Sell smart — reinvest transfer profit into the starting lineup.",
        ],
        "underdog": [
            "Avoid relegation or exceed preseason expectations.",
            "Make a cup run that creates a legacy moment.",
            "Keep the squad lean — prioritize free transfers and loanees.",
        ],
        "unknown": [
            f"Establish a clear identity for {club_name} in year one.",
            "Identify three core players to build around.",
            "Set a realistic transfer ceiling before the first window.",
        ],
    }

    items = objectives_by_tier.get(tier, objectives_by_tier["midtable"]).copy()

    # Use the Best XI OVR as the main signal (more relevant to career-mode outcomes).
    if best11_overall is not None and best11_overall >= 80:
        items = [items[0], "Push for domestic dominance — anything less is underachievement.", items[2]]

    # Ensure we always generate exactly 5 objectives.
    extras: list[str] = []
    if profile.get("youngUnder23Count", 0) >= 3:
        extras.append("Integrate one academy standout into the matchday spine.");
    if profile.get("seniorOver32Count", 0) >= 4:
        extras.append("Build cohesion around your veterans and protect key roles.");
    if profile.get("starCount", 0) >= 2:
        extras.append("Design your season around one match-winner to avoid drift.");
    if profile.get("prospectCount", 0) >= 3:
        extras.append("Secure one high-potential addition to raise your ceiling.");

    extras.extend(
        [
            "Win at least one high-leverage fixture against a top-side (or your nearest rival).",
            "Keep finances stable by reinvesting smartly instead of panic spending.",
        ]
    )

    # De-duplicate while keeping order.
    full: list[str] = []
    for t in items + extras:
        if t not in full:
            full.append(t)

    full = full[:5]
    return [{"id": f"obj-{index}", "text": text, "source": "generated"} for index, text in enumerate(full, start=1)]


def derive_storylines(
    club_name: str,
    edition: int,
    profile: dict,
    philosophy: dict,
    era_narratives: list[dict],
    future_players: list[dict],
    ex_players: list[dict],
) -> list[dict]:
    storylines: list[dict] = []
    current_era = next((era for era in era_narratives if era["edition"] == edition), None)

    if current_era and current_era.get("narrative"):
        storylines.append(
            {
                "type": "era",
                "title": current_era["headline"],
                "body": current_era["narrative"],
            }
        )

    storylines.append(
        {
            "type": "philosophy",
            "title": philosophy.get("title", "Club philosophy"),
            "body": philosophy.get("summary", ""),
        }
    )

    if profile.get("youngUnder23Count", 0) >= 4:
        storylines.append(
            {
                "type": "squad",
                "title": "Youth wave",
                "body": (
                    f"{profile['youngUnder23Count']} players are under 23 — "
                    f"career mode can lean into homegrown minutes and lower transfer spend."
                ),
            }
        )

    if profile.get("seniorOver32Count", 0) >= 6:
        storylines.append(
            {
                "type": "squad",
                "title": "Experience spine",
                "body": (
                    f"{profile['seniorOver32Count']} senior players are over 32, suggesting a focused leadership window "
                    f"before a rebuild becomes unavoidable."
                ),
            }
        )

    if future_players:
        names = ", ".join(player["name"] for player in future_players[:4])
        next_edition = min(player.get("joinsClubEdition", edition + 1) for player in future_players)
        storylines.append(
            {
                "type": "future",
                "title": "Destined arrivals",
                "body": (
                    f"Dataset timeline points to {names} joining {club_name} by FIFA {next_edition}. "
                    f"Plan your save around those arrivals or try to sign them early."
                ),
            }
        )

    if ex_players:
        names = ", ".join(player["name"] for player in ex_players[:4])
        storylines.append(
            {
                "type": "legacy",
                "title": "Club legends elsewhere",
                "body": (
                    f"Former {club_name} players still active in FIFA {edition}: {names}. "
                    f"Re-signing ex-players fits the club narrative and squad gaps."
                ),
            }
        )

    later_eras = [era for era in era_narratives if era["edition"] > edition and era.get("avgOverall")]
    if later_eras:
        peak = max(later_eras, key=lambda era: era.get("avgOverall") or 0)
        if peak.get("avgOverall") and profile.get("avgOverall") and peak["avgOverall"] - profile["avgOverall"] >= 2:
            storylines.append(
                {
                    "type": "timeline",
                    "title": f"Brighter future in FIFA {peak['edition']}",
                    "body": (
                        f"The squad peaks in the dataset around FIFA {peak['edition']} "
                        f"(avg OVR {peak['avgOverall']}). A long-term career arc rewards patience."
                    ),
                }
            )

    return storylines


def build_club_narrative(
    club_name: str,
    edition: int,
    players: list[dict],
    timeline: list[dict],
    future_players: list[dict] | None = None,
    ex_players: list[dict] | None = None,
) -> dict:
    profile = analyze_squad(players)
    top_players = sorted(
        players,
        key=lambda player: (_to_int(player.get("overall")) or 0, player.get("name", "")),
        reverse=True,
    )[:3]
    philosophy = derive_philosophy(club_name, profile, top_players)
    budget = derive_budget(profile)

    # Historical nationality core (across the club’s presence in FIFA editions).
    # This is used to enrich philosophy/story with a “based on history” flavor.
    hist_counts: dict[str, int] = {}
    for entry in timeline or []:
        summary = entry.get("summary") or {}
        for nat in summary.get("dominantNationalities") or []:
            if nat:
                hist_counts[nat] = hist_counts.get(nat, 0) + 1
    hist_doms = [nat for nat, _ in sorted(hist_counts.items(), key=lambda kv: (-kv[1], kv[0].casefold()))[:3]]
    if hist_doms:
        hist_nat_counts = [((entry.get("summary") or {}).get("nationalityCount")) for entry in timeline or []]
        hist_nat_counts = [n for n in hist_nat_counts if isinstance(n, int) and n > 0]
        max_span = max(hist_nat_counts) if hist_nat_counts else None
        history_line = (
            f"Across the dataset, the club’s identity often centers on {', '.join(f'{n} ({hist_counts.get(n, 0)} players)' for n in hist_doms[:3])}"
            f"{f' with squads spanning up to {max_span} nationalities' if max_span else ''}."
        )
        if philosophy.get("summary"):
            philosophy["summary"] = f"{philosophy['summary']} {history_line}"
        else:
            philosophy["summary"] = history_line

    era_narratives: list[dict] = []
    previous_players: list[dict] | None = None
    previous_summary: dict | None = None

    for entry in timeline:
        current_players = entry.get("players") or []
        summary = entry.get("summary") or {}
        delta = _player_delta(current_players, previous_players or [])
        era_narratives.append(
            derive_era_narrative(
                club_name,
                entry["edition"],
                summary,
                previous_summary,
                delta,
            )
        )
        previous_players = current_players
        previous_summary = summary

    storylines = derive_storylines(
        club_name,
        edition,
        profile,
        philosophy,
        era_narratives,
        future_players or [],
        ex_players or [],
    )
    objectives = derive_board_objectives(philosophy, profile, club_name)

    return {
        "edition": edition,
        "club": club_name,
        "profile": profile,
        "philosophy": philosophy,
        "budget": budget,
        "eraNarratives": era_narratives,
        "storylines": storylines,
        "suggestedObjectives": objectives,
        "datasetEditions": editions(),
    }
