// Master List of Destination Facilities
const masterHospitals = [
    { id: "baptist_louisville", name: "Baptist Health Louisville", lat: 38.23885368709200, lng: -85.63917771315160, type: "adult", region: "jefferson" },
    { id: "norton_women_children", name: "Norton Women's & Children's (Suburban)", lat: 38.23558071531270, lng: -85.63158611445510, type: "split", region: "jefferson" },
    { id: "uofl_mc_east", name: "UofL Health - MC East ER (Jewish East)", lat: 38.23114041993000, lng: -85.63694179169460, type: "adult", region: "jefferson" },
    { id: "norton_brownsboro", name: "Norton Brownsboro", lat: 38.31634156358550, lng: -85.57558139921120, type: "adult", region: "jefferson" },
    { id: "norton_children_brownsboro", name: "Norton Children's MC (Brownsboro)", lat: 38.31569198353950, lng: -85.56956072719920, type: "peds", region: "jefferson" },
    { id: "baptist_blankenbaker", name: "Baptist Health ER (Blankenbaker)", lat: 38.21744177540010, lng: -85.53839801419970, type: "adult", region: "jefferson" },
    { id: "norton_audubon", name: "Norton Audubon", lat: 38.21520796968180, lng: -85.72403667459940, type: "adult", region: "jefferson" },
    { id: "norton_downtown", name: "Norton Hospital (Downtown)", lat: 38.24750719216270, lng: -85.75149999973130, type: "adult", region: "jefferson" },
    { id: "norton_children_downtown", name: "Norton Children's (Downtown)", lat: 38.24818271556100, lng: -85.75017118854950, type: "peds", region: "jefferson" },
    { id: "jewish_downtown", name: "Jewish Hospital (Downtown)", lat: 38.24839488506370, lng: -85.75157457164980, type: "adult", region: "jefferson" },
    { id: "uofl_hospital", name: "UofL Health - UofL Hospital", lat: 38.24786926143180, lng: -85.74318088452280, type: "adult", region: "jefferson" },
    { id: "norton_west_louisville", name: "Norton West Louisville ER", lat: 38.24720893353440, lng: -85.79873887144740, type: "adult", region: "jefferson" },
    { id: "uofl_mary_elizabeth", name: "UofL Health - Mary & Elizabeth", lat: 38.17880867023050, lng: -85.79382665040330, type: "adult", region: "jefferson" },
    { id: "baptist_glenmary", name: "Baptist Health Glenmary", lat: 38.136018474849024, lng: -85.58069320336894, type: "adult", region: "jefferson" },
    { id: "uofl_mc_southwest", name: "UofL Health - MC Southwest ER", lat: 38.11322941906840, lng: -85.84092345934400, type: "adult", region: "jefferson" },
    { id: "louisville_va", name: "Louisville VA Hospital", lat: 38.27017803622843, lng: -85.69673200715734, type: "adult", region: "jefferson" },
    { id: "baptist_lagrange", name: "Baptist Health LaGrange", lat: 38.39436543175370, lng: -85.37700258407050, type: "adult", region: "outside" },
    { id: "norton_clark", name: "Norton Clark Hospital (IN)", lat: 38.28185133304160, lng: -85.74788493093270, type: "adult", region: "outside" },
    { id: "baptist_floyd", name: "Baptist Health Floyd (IN)", lat: 38.30038280115690, lng: -85.83484296507200, type: "adult", region: "outside" },
    { id: "uofl_mc_south", name: "UofL Health - MC South (Brooks)", lat: 38.06108454853360, lng: -85.69721919213730, type: "adult", region: "outside" }
];

// Adult Emergency Conditions Data
const adultConditions = [
    {
        id: "med1",
        title: "Medical",
        def: "Capable of accepting medical patients who do not fit the Acute Medical requiring admission category.",
        hospitalIds: ["baptist_louisville", "baptist_lagrange", "uofl_mc_east", "uofl_mc_south", "uofl_mc_southwest", "uofl_mary_elizabeth", "norton_audubon", "norton_women_children", "norton_downtown", "norton_brownsboro", "uofl_hospital", "norton_clark", "baptist_floyd", "louisville_va"]
    },
    {
        id: "med2",
        title: "Acute Medical (Requiring Admission)",
        def: "Capable of accepting patients in the ED whose medical condition would most likely require admission including: acute stroke with deficits, elderly with SOA and underlying medical conditions/abnormal vital signs, dialysis emergency, or acute coronary syndrome.",
        hospitalIds: ["baptist_louisville", "baptist_lagrange", "uofl_mary_elizabeth", "norton_audubon", "norton_women_children", "norton_downtown", "norton_brownsboro", "uofl_hospital", "norton_clark", "baptist_floyd", "louisville_va"]
    },
    {
        id: "stemi",
        title: "STEMI",
        def: "Capable of performing Percutaneous Coronary Intervention (PCI).",
        hospitalIds: ["baptist_louisville", "baptist_lagrange", "uofl_mary_elizabeth", "norton_audubon", "norton_downtown", "norton_brownsboro", "uofl_hospital", "baptist_floyd", "norton_women_children"]
    },
    {
        id: "stroke",
        title: "Stroke",
        def: "Any patient meeting stroke criteria who is NOT positive on a severity scale for ELVO (aka LVO), shall be transported to an accredited stroke center.",
        hospitalIds: ["baptist_louisville", "baptist_lagrange", "uofl_mc_east", "uofl_mary_elizabeth", "norton_audubon", "norton_women_children", "norton_downtown", "norton_brownsboro", "uofl_hospital", "norton_clark", "baptist_floyd"]
    },
    {
        id: "elvo",
        title: "ELVO (aka LVO) Stroke",
        def: "All patients who screen positive on a stroke severity scale should be transported to an accredited ELVO capable facility.",
        hospitalIds: ["baptist_louisville", "norton_downtown", "norton_brownsboro", "uofl_hospital"]
    },
    {
        id: "burn_center",
        title: "Burn Center",
        def: "Patients with major burns as defined by current protocol.",
        note: "Protocol Triaging: Patients < 18 yo go to Kosair/Norton Children's Hospital (KCH). All adult burn patients not triaged to KCH go to UofL Hospital.",
        hospitalIds: ["norton_children_downtown", "uofl_hospital"]
    },
    {
        id: "burns",
        title: "Burns (Non-Burn Center)",
        def: "Capable of managing burns not triaged to a designated Burn Center.",
        hospitalIds: ["baptist_louisville", "baptist_lagrange", "uofl_mc_east", "uofl_mc_south", "uofl_mc_southwest", "uofl_mary_elizabeth", "norton_audubon", "norton_women_children", "norton_downtown", "norton_brownsboro", "uofl_hospital", "norton_clark", "baptist_floyd"]
    },
    {
        id: "hazmat_daily",
        title: "HazMat Decon Non-Mass Casualty",
        def: "Capable of technical decontamination for chemical, radiological or biological substance exposure with daily capability.",
        hospitalIds: ["uofl_hospital"]
    },
    {
        id: "hazmat_mass",
        title: "HazMat Decon Mass Casualty",
        def: "Capable of technical decontamination in a mass casualty situation (facilities with decon trailers/tents).",
        hospitalIds: ["baptist_louisville", "baptist_lagrange", "uofl_mc_east", "uofl_mc_south", "uofl_mc_southwest", "uofl_mary_elizabeth", "norton_audubon", "norton_women_children", "norton_downtown", "norton_brownsboro", "uofl_hospital", "norton_clark", "baptist_floyd", "louisville_va"]
    },
    {
        id: "poison",
        title: "Poison & Drug Overdose",
        def: "Facilities capable of managing acute toxicological and overdose presentations.",
        hospitalIds: ["baptist_louisville", "baptist_lagrange", "uofl_mc_east", "uofl_mc_south", "uofl_mc_southwest", "uofl_mary_elizabeth", "norton_audubon", "norton_women_children", "norton_downtown", "norton_brownsboro", "uofl_hospital", "norton_clark", "baptist_floyd", "louisville_va"]
    },
    {
        id: "psychiatric",
        title: "Psychiatric",
        def: "Facilities designated to accept and evaluate patients presenting with primary psychiatric emergencies or acute mental health crises.",
        hospitalIds: ["baptist_louisville", "baptist_lagrange", "uofl_mary_elizabeth", "norton_audubon", "norton_women_children", "norton_downtown", "norton_brownsboro", "uofl_hospital", "norton_clark", "baptist_floyd", "louisville_va"]
    },
    {
        id: "level1_trauma",
        title: "Level 1 Trauma",
        def: "Major acute trauma requiring Level 1 capability as defined by current protocol.",
        note: "Triage Criteria: Patients ≥ 13 years of age with penetrating trauma AND ≥ 15 years of age with blunt trauma will be triaged to UofL Hospital. All Level 1 trauma patients not triaged to UofL will be taken to KCH/Norton Children's.",
        hospitalIds: ["uofl_hospital", "norton_children_downtown"]
    },
    {
        id: "gyn",
        title: "Gynecological",
        def: "Capable of treating patients whose gynecological condition may require rapid/emergent surgical intervention or admission (including severe vaginal bleeding in patients of childbearing age).",
        hospitalIds: ["baptist_louisville", "baptist_lagrange", "norton_audubon", "norton_women_children", "norton_downtown", "norton_brownsboro", "uofl_hospital", "baptist_floyd"]
    },
    {
        id: "ob",
        title: "Obstetrical",
        def: "Capable of providing complete care for mother and fetus, including emergent C-section.",
        hospitalIds: ["baptist_louisville", "norton_women_children", "norton_downtown", "uofl_hospital", "norton_clark", "baptist_floyd"]
    },
    {
        id: "newborn",
        title: "Newborn",
        def: "Capable of caring for infants less than 30 days old.",
        hospitalIds: ["baptist_louisville", "norton_women_children", "norton_downtown", "uofl_hospital", "norton_clark", "baptist_floyd"]
    }
];

// Pediatric Emergency Conditions Data
const pedConditions = [
    {
        id: "ped_newborn",
        title: "Newborn",
        def: "Capable of caring for infants less than 30 days old.",
        hospitalIds: ["norton_children_downtown", "norton_women_children", "uofl_hospital", "norton_clark", "baptist_floyd"]
    },
    {
        id: "ped_icu",
        title: "Pediatric ICU",
        def: "Capable of providing comprehensive critical care services to patients < 18 years of age.",
        hospitalIds: ["norton_children_downtown"]
    },
    {
        id: "ped_adm",
        title: "Pediatric Admission",
        def: "Capable of treating all pediatric patients which may require emergent surgical intervention and/or admission to the hospital but are not triaged to Pediatric ICU.",
        hospitalIds: ["norton_children_downtown", "norton_women_children", "norton_clark", "baptist_floyd"]
    },
    {
        id: "ped_18",
        title: "Pediatric < 18 yo",
        def: "Capable of complete care in the Emergency Department for all patients less than 18 years of age.",
        hospitalIds: ["norton_children_downtown", "norton_children_brownsboro", "baptist_louisville", "baptist_lagrange", "uofl_mc_east", "uofl_mc_south", "uofl_mc_southwest", "uofl_mary_elizabeth", "norton_audubon", "norton_women_children", "uofl_hospital", "norton_clark", "baptist_floyd"]
    },
    {
        id: "ped_trauma",
        title: "Pediatric Trauma",
        def: "Level 1 Pediatric Trauma criteria.",
        note: "Triage Criteria: Pediatric patients < 13 years of age with penetrating trauma AND < 15 years of age with blunt trauma will be triaged to NCH (Norton Children's Hospital). All Level 1 trauma patients not triaged to UofL will be taken to UofL Hospital.",
        hospitalIds: ["norton_children_downtown", "uofl_hospital"]
    }
];
