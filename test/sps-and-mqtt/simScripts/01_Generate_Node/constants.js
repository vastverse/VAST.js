const SCALE = {
    TEST: {
        name: 'test',
        clients: 10
    },
    SMALL: {
        name: 'small',
        clients: 100
    },
    MEDIUM: {
        name: 'medium',
        clients: 1000
    },
    LARGE: {
        name: 'large',
        clients: 10000
    },
    XLARGE: {
        name: 'xlarge',
        clients: 100000
    }
};

const ZONE_PATTERNS = {
    UNIFORM: {
        name: 'uniform',
        distribution: {
            NW: 25,
            NE: 25,
            SW: 25,
            SE: 25
        }
    },
    SINGLE_HOT_ZONE: {
        name: 'single_hot_zone',
        distribution: {
            NW: 75,
            NE: 10,
            SW: 10,
            SE: 5
        }
    },
    DUAL_HOT_ZONES: {
        name: 'dual_hot_zones',
        distribution: {
            NW: 40,
            NE: 40,
            SW: 10,
            SE: 10
        }
    },
    TRIPLE_HOT_ZONES: {
        name: 'triple_hot_zones',
        distribution: {
            NW: 40,
            NE: 30,
            SW: 25,
            SE: 5
        }
    }
};

const TOPICS = {
    WAREHOUSE: {
        PUBLISH: [
            'inventoryAvailable',
            'packageReady',
            'inventoryLow'
        ],
        SUBSCRIBE: [
            'deliveryConfirmation',
            'truckArrival',
            'inventoryRequest'
        ]
    },
    TRUCK: {
        PUBLISH: [
            'truckLocation',
            'truckStatus',
            'deliveryStatus',
            'truckArrival'
        ],
        SUBSCRIBE: [
            'packageReady',
            'deliveryRequest',
            'routeUpdate'
        ]
    },
    CUSTOMER: {
        PUBLISH: [
            'deliveryRequest',
            'deliveryConfirmation',
            'inventoryRequest'
        ],
        SUBSCRIBE: [
            'deliveryStatus',
            'inventoryAvailable',
            'estimatedArrival'
        ]
    }
};

module.exports = {
    SCALE,
    ZONE_PATTERNS,
    TOPICS
};