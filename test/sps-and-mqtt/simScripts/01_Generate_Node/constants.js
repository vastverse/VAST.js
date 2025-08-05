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
            'inventory.available',
            'package.ready',
            'inventory.low'
        ],
        SUBSCRIBE: [
            'delivery.confirmation',
            'truck.arrival',
            'inventory.request'
        ]
    },
    TRUCK: {
        PUBLISH: [
            'truck.location',
            'truck.status',
            'delivery.status',
            'truck.arrival'
        ],
        SUBSCRIBE: [
            'package.ready',
            'delivery.request',
            'route.update'
        ]
    },
    CUSTOMER: {
        PUBLISH: [
            'delivery.request',
            'delivery.confirmation',
            'inventory.request'
        ],
        SUBSCRIBE: [
            'delivery.status',
            'inventory.available',
            'estimated.arrival'
        ]
    }
};

module.exports = {
    SCALE,
    ZONE_PATTERNS,
    TOPICS
};