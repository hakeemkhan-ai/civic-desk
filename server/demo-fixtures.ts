import type { Category, Status, Location, Content } from '../shared/domain.js';
export const legacyFixtures: [string, string, Category, string, number, number, Status][] = [
    [
      'Pothole outside the community library',
      'A pothole has opened in the road outside the library entrance. It was noticed on Monday.',
      'roads',
      'Maple Street · Library entrance',
      12.9701,
      77.5901,
      'in progress',
    ],
    [
      'Waste collection missed on Cedar Lane',
      'The shared bins beside Cedar Lane Park are full. The scheduled collection was missed.',
      'waste',
      'Cedar Lane · Park entrance',
      12.9718,
      77.5922,
      'under review',
    ],
    [
      'Streetlight out near the bus stop',
      'Light pole BF-042 is not lighting up after dark, leaving the bus stop area unlit.',
      'streetlights',
      'Oak Avenue · Bus stop 4',
      12.9742,
      77.594,
      'assigned',
    ],
    [
      'Water leaking beside the market',
      'Water is flowing from a pipe beside the market entrance. The source has not been confirmed.',
      'water',
      'Market Road · East entrance',
      12.969,
      77.591,
      'submitted',
    ],
    [
      'Blocked drain at the garden gate',
      'Leaves and debris are blocking the drain beside the south garden gate. Water collects there after rain.',
      'drainage',
      'Garden Walk · South gate',
      12.967,
      77.589,
      'resolved',
    ],
    [
      'Uneven paving on Willow Street',
      'Two paving slabs have lifted outside the post office entrance.',
      'roads',
      'Willow Street · Post office',
      12.976,
      77.596,
      'under review',
    ],
    [
      'Light flickering outside the school',
      'Light pole BF-077 flickers repeatedly in the evening.',
      'streetlights',
      'School Road · North gate',
      12.978,
      77.595,
      'submitted',
    ],
    [
      'Drain overflow beside the sports ground',
      'The roadside drain is overflowing after rain near the west entrance to the sports ground.',
      'drainage',
      'Park Road · Sports ground',
      12.966,
      77.593,
      'submitted',
    ],
    [
      'Waste left beside the recycling point',
      'Several bags of waste have been left outside the recycling bins.',
      'waste',
      'Elm Street · Recycling point',
      12.972,
      77.597,
      'resolved',
    ],
  ];
const places: [string, string, string, number, number][] = [
  [
    "Pothole near the State Central Library",
    "A synthetic pothole example near the State Central Library in Afzal Gunj.",
    "Afzal Gunj \u00b7 State Central Library",
    17.3713,
    78.4803
  ],
  [
    "Missed waste collection near Indira Park",
    "Synthetic example: shared bins near Indira Park await collection.",
    "Lower Tank Bund \u00b7 Indira Park",
    17.4148,
    78.4841
  ],
  [
    "Streetlight out near Secunderabad station",
    "Synthetic light pole HYD-042 is not lighting up near the station approach.",
    "Secunderabad \u00b7 Station approach",
    17.4344,
    78.5013
  ],
  [
    "Water leaking near Moazzam Jahi Market",
    "Synthetic example: water is flowing beside the market; the source is unconfirmed.",
    "Moazzam Jahi Market \u00b7 Market approach",
    17.3843,
    78.4752
  ],
  [
    "Blocked drain near Charminar",
    "Synthetic example: debris blocks a roadside drain near Charminar.",
    "Charminar \u00b7 Pedestrian approach",
    17.3616,
    78.4747
  ],
  [
    "Uneven paving near Abids",
    "Synthetic example: two paving slabs have lifted along a footpath in Abids.",
    "Abids \u00b7 Main road footpath",
    17.393,
    78.4765
  ],
  [
    "Flickering streetlight near Begumpet",
    "Synthetic light pole HYD-077 flickers repeatedly in the evening.",
    "Begumpet \u00b7 Station approach",
    17.4375,
    78.4583
  ],
  [
    "Drain overflow near Malakpet",
    "Synthetic example: a roadside drain is overflowing after rain in Malakpet.",
    "Malakpet \u00b7 Station approach",
    17.3774,
    78.4936
  ],
  [
    "Waste beside a collection point in Nampally",
    "Synthetic example: bags of waste have been left outside a collection point.",
    "Nampally \u00b7 Station approach",
    17.3921,
    78.4676
  ]
];
export const hyderabadFixtures: typeof legacyFixtures = legacyFixtures.map((row, i) => {
  const [title, description, label, lat, lng] = places[i];
  return [title, description, row[2], label, lat, lng, row[6]];
});
export function fixtureFields(index: number, legacy = false): { content: Content; location: Location } {
  const [title, description, category, label, lat, lng] = (legacy ? legacyFixtures : hyderabadFixtures)[index];
  return { content: { title, description, category }, location: {
    label, lat, lng,
    area: lat > (legacy ? 12.974 : 17.42) ? 'north' : lat < (legacy ? 12.969 : 17.38) ? 'south' : 'central',
    precision: legacy ? 'exact' : 'approximate',
    assetId: category === 'streetlights' ? `${legacy ? 'BF' : 'HYD'}-${index === 2 ? '042' : '077'}` : '',
  } };
}
