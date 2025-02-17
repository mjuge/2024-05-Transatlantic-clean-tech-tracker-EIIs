jQuery(document).ready(async function () {
    const baseMapPath = 'https://code.highcharts.com/mapdata/';
    let pymChild;

    function initializePym() {
        pymChild = new pym.Child({ polling: 100, debug: true });

        // Function to set initial height and width to fit the parent’s #main-container dimensions
        const updateSize = () => {
            const containerWidth = Math.min(window.innerWidth, 1000); // Match parent max-width
            const containerHeight = window.innerHeight * 1; // Match parent height
            jQuery("#main-container").css({
                width: `${containerWidth}px`,
                height: `${containerHeight}px`
            });
            pymChild.sendHeight(containerHeight); // Send a fixed height instead of dynamic resizing
            if (pymChild) {
                pymChild.sendHeight(containerHeight);
            }
            
        };

        // Set initial size
        setTimeout(updateSize, 500);

        // Optional: Listen for window resize to reapply the fixed dimensions
        window.addEventListener('resize', updateSize);
        if (pymChild) pymChild.sendHeight();
    }

    let allPoints = [];
    let currentCountry = null;
    let currentBubbleValue = "bubble_size"; // Default bubble value

    
        // Render the map
        renderMap();
    // Initialize active filters for each tech-status pair
    let activeFilters = {
        steel: { under_construction: true, operational: true},
        cement: { under_construction: true, operational: true},
    };

    async function fetchCitiesGeoJSON() {
        try {
            const response = await fetch('data/cities.json');
            const data = await response.json();
    
            return data.features.map(feature => ({
                name: feature.properties.name,
                lat: feature.geometry.coordinates[1], // Latitude
                lon: feature.geometry.coordinates[0]  // Longitude
            }));
        } catch (error) {
            console.error('Error fetching city data:', error);
            return [];
        }
    }


    
    
    
    async function fetchPoints(topology) {
        try {
            const response = await fetch('data/cement-steel-data.json');
            const rawData = await response.json();
    
            const colorMap = {
                steel: { under_construction: '#FFA07A', operational: '#FF4500', unknown: '#CCCCCC' },
                cement: { under_construction: '#98FB98', operational: '#32CD32', unknown: '#AAAAAA' },
            };
    
            // Adjust coordinates function
            function adjustCoordinatesForHighcharts(lat, lon, topology) {
                const mapData = Highcharts.geojson(topology);
    
                // Function to check if a point is inside a polygon
                const isPointInPolygon = (point, polygon) => {
                    const [x, y] = point;
                    let inside = false;
    
                    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                        const xi = polygon[i][0], yi = polygon[i][1];
                        const xj = polygon[j][0], yj = polygon[j][1];
    
                        const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
                        if (intersect) inside = !inside;
                    }
                    return inside;
                };
    
                // Check if the given point is inside the country's boundaries
                const pointCoords = [lon, lat];
                let inside = false;
    
                mapData.forEach(feature => {
                    const geometry = feature.geometry;
                    if (geometry.type === "Polygon") {
                        if (isPointInPolygon(pointCoords, geometry.coordinates[0])) {
                            inside = true;
                        }
                    } else if (geometry.type === "MultiPolygon") {
                        geometry.coordinates.forEach(polygon => {
                            if (isPointInPolygon(pointCoords, polygon[0])) {
                                inside = true;
                            }
                        });
                    }
                });
    
                if (inside) {
                    return { lat, lon }; // Return original coordinates if inside
                }
    
                console.log(`Debug: Point (${lat}, ${lon}) is outside the map. Adjusting...`);
    
                // Find the nearest point inside the map
                let nearestPoint = null;
                let minDistance = Infinity;
    
                mapData.forEach(feature => {
                    feature.geometry.coordinates.forEach(polygon => {
                        polygon[0].forEach(([polyLon, polyLat]) => {
                            const distance = Math.sqrt((lat - polyLat) ** 2 + (lon - polyLon) ** 2);
                            if (distance < minDistance) {
                                minDistance = distance;
                                nearestPoint = { lat: polyLat, lon: polyLon };
                            }
                        });
                    });
                });
    
                if (nearestPoint) {
                    console.log(`Debug: Adjusted to nearest point (${nearestPoint.lat}, ${nearestPoint.lon})`);
                    return nearestPoint;
                }
    
                // If no nearest point found, return the original (fallback)
                return { lat, lon };
            }
    
            // Map raw data to points with adjusted coordinates for Highcharts
            allPoints = rawData.map(item => {
                let originalLat = parseFloat(item.latitude);
                let originalLon = parseFloat(item.longitude);
                let adjustedCoords = topology ? adjustCoordinatesForHighcharts(originalLat, originalLon, topology) : { lat: originalLat, lon: originalLon };
            
                return {
                    name: item.company || 'Unknown',
                    lat: originalLat, // Keep original for Leaflet
                    lon: originalLon,
                    highchartLat: adjustedCoords.lat, // Adjusted for Highcharts
                    highchartLon: adjustedCoords.lon,
                    bubble_size: item.bubble_size || 0.1,
                    tech: item.tech || 'unknown',
                    tech_full: item.tech_full || '',
                    png: item.png || '',
                    zoom: item.zoom || 13,
                    html: item.html || '',
                    projectID: item.projectID || '',
                    component_full: item.component_full || '',
                    location: item.location || 'Unknown',
                    status: item.status || 'unknown',
                    scale: item.scale || 'unknown',
                    status_message: item.scale ? `${item.scale}` : 'Unknown',
                    country: item.country || 'Unknown',
                    color: colorMap[item.tech]?.[item.status] || '#000000',
                };
            });
            
            // Apply the function to avoid perfect overlays
            allPoints = adjustOverlappingPoints(allPoints);
            
            console.log("Debug: tkH2Steel Coordinates:", 51.491649, 6.733051);
            console.log("Debug: Oxelösund Coordinates:", 58.6760961099, 17.1284402038);
            console.log("Debug: Points processed successfully:", allPoints.length);
    
        } catch (error) {
            console.error('Error fetching points:', error);
        }
    }
    
    function filterPointsInCountry(points, topology) {
        const mapData = Highcharts.geojson(topology);
    
        console.log("Debug: Map data processed from topology:", mapData);
    
        // Improved point-in-polygon check with explicit coordinate order
        const isPointInPolygon = (point, polygon) => {
            const [x, y] = point; // Ensure [longitude, latitude] order
            let inside = false;
    
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const xi = polygon[i][0], yi = polygon[i][1];
                const xj = polygon[j][0], yj = polygon[j][1];
    
                const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
                if (intersect) inside = !inside;
            }
            return inside;
        };
    
        // Filter points using bounding box (if available) and geometry checks
        const filteredPoints = points.filter(point => {
            const pointCoords = [point.lon, point.lat];
    
            const inside = mapData.some(feature => {
                const geometry = feature.geometry;
                if (geometry.type === "Polygon") {
                    return isPointInPolygon(pointCoords, geometry.coordinates[0]);
                } else if (geometry.type === "MultiPolygon") {
                    return geometry.coordinates.some(polygon =>
                        isPointInPolygon(pointCoords, polygon[0])
                    );
                }
                return false;
            });
    
            return inside;
        });
    
        console.log(`Debug: Filtered ${filteredPoints.length} points inside country borders.`);
        return filteredPoints;
    }
    
      

    function filterPoints(points) {
        return points.filter(point => activeFilters[point.tech]?.[point.status]);
    }

    function getBubbleData(points) {
        return points.map(point => ({
            name: point.name,
            lat: point.lat,
            lon: point.lon,
            tech_full: point.tech_full,
            zoom: point.zoom,
            projectID: point.projectID,
            html: point.html,
            component_full: point.component_full,
            status_message: point.status_message,
            z: point.bubble_size, // Dynamic bubble size
            bubble_size: point.bubble_size,
            tech: point.tech,
            status: point.status,
            png: point.png,
            location: point.location,
            country: point.country,
            color: point.color
        }));
    }
   
    async function renderMap() {
        const countryNameMap = {
            all: "Europe",
            AT: "Austria",
            BE: "Belgium",
            BG: "Bulgaria",
            HR: "Croatia",
            CY: "Cyprus",
            CZ: "Czech Republic",
            DK: "Denmark",
            EE: "Estonia",
            FI: "Finland",
            FR: "France",
            DE: "Germany",
            GR: "Greece",
            HU: "Hungary",
            IE: "Ireland",
            IT: "Italy",
            LV: "Latvia",
            LT: "Lithuania",
            LU: "Luxembourg",
            MT: "Malta",
            NL: "Netherlands",
            PL: "Poland",
            PT: "Portugal",
            RO: "Romania",
            SK: "Slovakia",
            SI: "Slovenia",
            ES: "Spain",
            SE: "Sweden",
            GB: "United Kingdom",
            NO: "Norway",
            CH: "Switzerland"
        };
    
        const mapUrl =
            currentCountry && currentCountry !== 'all'
                ? `${baseMapPath}countries/${currentCountry.toLowerCase()}/${currentCountry.toLowerCase()}-all.topo.json`
                : `${baseMapPath}custom/europe.topo.json`;
    
        console.log(`Debug: Fetching topology for ${currentCountry || 'Europe'} from ${mapUrl}`);
    
        try {
            // Fetch the topology data
            const topology = await fetch(mapUrl).then(response => response.json());
            console.log("Debug: Topology data fetched:", topology);
    
            // Remove Russia and Turkey from the topology data
            topology.objects.default.geometries = topology.objects.default.geometries.filter(
                geometry => geometry.properties.name !== 'Turkey' && geometry.properties.name !== 'Russia' && geometry.properties.name !== 'Iceland'
            );
    
            console.log("Debug: Russia removed from topology data:", topology.objects.default.geometries);
    
            // Fetch and filter points within the selected country
            await fetchPoints(topology);
    
            let cityPoints = [];
            if (currentCountry && currentCountry !== 'all') {
                cityPoints = await fetchCitiesGeoJSON();
                cityPoints = filterPointsInCountry(cityPoints, topology);
                console.log("Debug: Filtered city points:", cityPoints);
            }

    
            // Apply additional active filters
            const filteredPoints = filterPoints(allPoints);
            console.log("Debug: Points after applying active filters:", filteredPoints);
    
            // Prepare bubble data for rendering
            const bubbleData = getBubbleData(filteredPoints);
            console.log("Debug: Final bubble data for rendering:", bubbleData);
    
            // Build the map title dynamically
            const activeTechs = Object.keys(activeFilters).filter(
                tech => Object.values(activeFilters[tech]).some(status => status)
            );
            const techTitle = activeTechs.length === 0 
            ? "(Select technologies)"
            : activeTechs.length === 1
            ? activeTechs[0].charAt(0).toUpperCase() + activeTechs[0].slice(1).toLowerCase()
            : activeTechs.length === 2
            ? `${activeTechs[0].charAt(0).toUpperCase() + activeTechs[0].slice(1).toLowerCase()} and ${activeTechs[1].charAt(0).toUpperCase() + activeTechs[1].slice(1).toLowerCase()}`
            : `${activeTechs[0].charAt(0).toUpperCase() + activeTechs[0].slice(1).toLowerCase()}, ${activeTechs[1].charAt(0).toUpperCase() + activeTechs[1].slice(1).toLowerCase()} and ${activeTechs[2].charAt(0).toUpperCase() + activeTechs[2].slice(1).toLowerCase()}`;
        
            const bubbleMetric = "investments"; // Fixed
            const unit = "EUR"; // Fixed
            const countryName = countryNameMap[currentCountry] || "Europe";
            const mapTitle = `Industry-Led Projects in ${countryName}`;
            

        
            // Render the Highcharts map
            Highcharts.mapChart('container', {
                chart: { map: topology },
                title: { text: `Decarbonising Cement and Steel Production`, align: 'left', style: { fontWeight: 'bold' } },
                subtitle: { text: mapTitle, align: 'left', style: { color: 'grey' } },
                mapNavigation: { enabled: true, buttonOptions: { verticalAlign: 'bottom' } },
                tooltip: {
                    shared: false, // Individual tooltips per point
                    useHTML: true, // Allow formatted HTML tooltips
                    formatter: function () {
                        if (this.series.type === 'mappoint') {
                            return false; // Skip tooltips for city markers
                        }
                
                        let currentPoint = this.point;
                        let chart = currentPoint.series.chart;
                        let overlappingPoints = [];
                
                        // Detect overlapping points (mapbubble series only)
                        chart.series.forEach(series => {
                            if (series.type === 'mapbubble') {
                                series.points.forEach(point => {
                                    if (
                                        point !== currentPoint &&
                                        Math.abs(point.plotX - currentPoint.plotX) < 1 && // Adjust overlap threshold
                                        Math.abs(point.plotY - currentPoint.plotY) < 1
                                    ) {
                                        overlappingPoints.push(point);
                                    }
                                });
                            }
                        });
                
                        // Unique map ID for each location
                        let lat = currentPoint.lat;
                        let lon = currentPoint.lon;
                        let pointZoom = currentPoint.zoom || 13;
                        let mapId = `map-${lat}-${lon}`.replace(/\./g, "-");
                
                        // Construct tooltip content
                        let tooltipContent = `
                            <b>${currentPoint.projectID} ${currentPoint.name} in ${currentPoint.location} (${currentPoint.country})</b><br>
                            Sector: ${currentPoint.tech} <br>
                            Technology: ${currentPoint.tech_full} <br>
                            Scale: ${currentPoint.status_message}<br>
                            
                            <div id="${mapId}" style="width: 250px; height: 150px; border:1px solid #ddd;"></div>
                        `;
                
                        // Include overlapping points in tooltip
                        if (overlappingPoints.length > 0) {
                            overlappingPoints.forEach(point => {
                                tooltipContent += `
                                    <b>${point.projectID} ${point.name} in ${point.location} (${point.country})</b><br>
                                    Technology: ${point.tech_full} <br>
                                    ${point.status_message}<br>
                                    
                                `;
                            });
                        }
                
                        // Ensure the map is created after tooltip renders
                        setTimeout(() => {
                            if (!document.getElementById(mapId)) return; // Prevent duplicate rendering
                            let map = L.map(mapId, {
                                center: [lat, lon],
                                zoom: pointZoom,
                                layers: [
                                    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                                        attribution: 'Esri World Imagery'
                                    })
                                ],
                                zoomControl: false,
                                dragging: false
                            });
                        }, 500);
                
                        return tooltipContent;
                    }
                },
                
                

                plotOptions: {
                    map: {
                        states: {
                            hover: {
                                enabled: false // Disable hover effect
                            },
                            inactive: {
                                opacity: 0.6 // Ensure inactive map areas retain full opacity
                            }
                        }
                    },
                    mappoint: {
                        states: {
                            hover: {
                                enabled: true, // Optionally enable hover effect for cities
                            },
                            inactive: {
                                opacity: 1 // Ensure cities retain full opacity during interaction
                            }
                        }
                    },
                    mapbubble: {
                        allowPointSelect: true, // Enable point selection
                        states: {
                            hover: {
                                enabled: true // Enable hover effect
                            }
                        },
                        point: {
                            events: {
                                click: function () {
                                    this.series.chart.tooltip.refresh(this); // Display tooltip on click
                                    this.select(); // Keep the point visually selected
                                }
                            }
                        }
                    }
                },                            
                series: [
                    {
                        name: 'Basemap',
                        mapData: topology,
                        borderColor: '#C0C0C0', // Set border color to black
                        borderWidth: 1, // Define border width
                        nullColor: '#FFFFFF', // Set land color to white
                        showInLegend: false,
                        enableMouseTracking: false,
                    },
                    {
                        type: 'mapbubble',
                        name: 'Investments',
                        data: bubbleData, // Bubble data with sizes (1, 2, 3)
                        sizeBy: 'width', // Proportional bubble size scaling
                        zMax: 3, // Maximum bubble_size value
                        zMin: 1, // Minimum bubble_size value
                        maxSize: 15, // Matches legend's maxSize
                        minSize: 5, // Matches legend's minSize
                        color: 'rgba(0, 0, 0, 0)', // Transparent bubbles
                        borderColor: '#000000', // Black border
                        borderWidth: 2,
                        showInLegend: false, // Legend managed by bubbleLegend
                    },                 
                    {
                        type: 'mappoint',
                        name: 'Cities',
                        data: cityPoints, // City points from mcities.json
                        marker: {
                            symbol: 'circle',
                            radius: 2,
                            fillColor: '#848884' // Red marker for cities
                        },
                        dataLabels: {
                            enabled: true,
                            format: '{point.name}',
                            style: {
                                fontSize: '8px',
                                color: '#848884', // Gray fill color for text
                                textOutline: '0px #848884' // Border color matches the fill color
                            }
                        },                        
                        tooltip: { enabled: false }, // Disable tooltips for city points
                        showInLegend: false
                    }
                ]
            });
        } catch (error) {
            console.error('Error rendering map:', error);
        }
      
        // Adjust iframe height if pymChild exists
        if (pymChild) {
            pymChild.sendHeight();
        }
    }

    // Add event listeners for country select
    $('#country-select').change(function () {
        currentCountry = $(this).val();
        renderMap(currentCountry);
    });
    // Color map for tech and status combinations
    const colorMap = {
        steel: {
            under_construction: '#FFA07A',
            operational: '#FF4500',
        },
        cement: {
            under_construction: '#98FB98',
            operational: '#32CD32',
        },
    };


  // Assign colors to color-boxes dynamically
  document.querySelectorAll('.tech-status-group .legend-item-with-color').forEach(item => {
    const tech = item.getAttribute('data-tech');
    const status = item.getAttribute('data-status');

    // Skip items without both tech and status attributes
    if (!tech || !status) return;

    // Get the color from the color map
    const color = colorMap[tech]?.[status] || '#CCCCCC'; // Default to grey if no match

    // Apply the color to the color-box
    const colorBox = item.querySelector('.color-box');
    if (colorBox) {
        colorBox.style.backgroundColor = color;
    }
});
document.querySelectorAll('.tech-status-group .legend-item-with-color').forEach(item => {
    item.addEventListener('click', function (event) {
        if (event.target.classList.contains('color-box')) {
            event.stopPropagation();
        }

        const tech = this.getAttribute('data-tech');
        const status = this.getAttribute('data-status');

        if (!status) {
            const isTechActive = !this.classList.contains('hidden');
            const statusButtons = document.querySelectorAll(
                `.tech-status-group .legend-item-with-color[data-tech="${tech}"][data-status]`
            );

            statusButtons.forEach(btn => {
                btn.classList.toggle('hidden', isTechActive);
                const status = btn.getAttribute('data-status');
                activeFilters[tech][status] = !isTechActive;

                const colorBox = btn.querySelector('.color-box');
                if (colorBox) {
                    colorBox.style.backgroundColor = !isTechActive
                        ? colorMap[tech]?.[status] || '#FFFFFF'
                        : '#FFFFFF';
                }
            });

            this.classList.toggle('hidden');
        } else {
            this.classList.toggle('hidden');
            const isActive = !this.classList.contains('hidden');
            activeFilters[tech][status] = isActive;

            const colorBox = this.querySelector('.color-box');
            if (colorBox) {
                colorBox.style.backgroundColor = isActive
                    ? colorMap[tech]?.[status] || '#FFFFFF'
                    : '#FFFFFF';
            }
        }

        // New logic: Check if all statuses under a tech are unselected
        const techStatuses = Object.values(activeFilters[tech]);
        const isAnyStatusActive = techStatuses.some(active => active);

        const techButton = document.querySelector(`.tech-status-group .legend-item-with-color[data-tech="${tech}"]:not([data-status])`);
        if (techButton) {
            if (isAnyStatusActive) {
                techButton.classList.remove('hidden');
            } else {
                techButton.classList.add('hidden');
            }
        }

        renderMap();
        if (pymChild) pymChild.sendHeight();
    });
});

    // Add click handling for color-box to mimic the parent legend-item-with-color
    document.querySelectorAll('.legend-item-with-color .color-box').forEach(colorBox => {
        colorBox.addEventListener('click', function () {
            const parentItem = this.parentElement;
            if (parentItem) {
                parentItem.click(); // Trigger parent item click
            }
        });
    });

    
    

// Fetch points and render the map initially
await fetchPoints();
renderMap();
initializePym();
});
