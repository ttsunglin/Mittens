# Mittens

A ImageJ/Fiji plugin for generating aligned multichannel images in publishable style, now with time-lapse support.

## Description

Mittens is a comprehensive plugin for ImageJ/Fiji that provides tools for advanced channel manipulation, alignment, and presentation of multichannel microscopy images. Perfect for creating publication-ready figure panels with consistent formatting and alignment. Version 2.0 adds full support for time-lapse data processing.

## Features

### Core Features
- **Channel Processing**: Duplicate, split, and invert channels from multichannel images
- **Selective Merging**: Create custom merged images using selected channels
- **Image Alignment**: Align multiple channels or merged images into horizontal montages
- **Scale Bar Integration**: Add calibrated scale bars while preserving pixel dimensions

### New in Version 2.0
- **Time Frame Support**: Process entire time-lapse sequences with the "use frames" option
- **Multi-dimensional Handling**: Properly handles images with Z-stacks and T-frames
- **Time Bar Integration**: Add temporal annotations to time-lapse data
- **Properties Access**: Quick access to image metadata and properties
- **Improved UI**: Cleaner interface with better button organization
- **Data Integrity**: Preserves original pixel values without unwanted modifications

## Installation

1. Download `Mittens_2.0.js` from this repository
2. Copy the file to your ImageJ/Fiji `plugins` folder
3. Restart ImageJ/Fiji
4. The plugin will appear under `Plugins > Mittens`

## Usage

### Basic Workflow
1. Open a multichannel image (with or without time frames) in ImageJ/Fiji
2. Launch Mittens from the Plugins menu
3. Use the interface to:
   - Adjust brightness/contrast
   - Duplicate and split channels (check "use frames" for time-lapse)
   - Select channels for merging
   - Align images for final presentation
   - Add scale bars and time bars

### Time-Lapse Processing
1. Open a time-lapse multichannel image
2. Check the "use frames" checkbox next to the Dup/Split/Invert button
3. Process all time frames simultaneously
4. Create aligned montages that preserve temporal information
5. Add time bars for temporal annotation

## Requirements

- ImageJ or Fiji
- Multichannel images (supports up to 4 channels)
- Optional: Time Bar plugin for temporal annotations

## Version History

### Version 2.0 (2025)
- Added time frame support for multi-dimensional images
- Integrated Time Bar plugin support
- Improved UI layout and organization
- Fixed data integrity issues
- Added proper hyperstack handling

### Version 1.0 (2024)
- Initial release
- Basic channel processing and alignment features

## Author

Tsung-Lin Tsai (TTL)

## Version

2.0

## License

MIT License - see LICENSE file for details
