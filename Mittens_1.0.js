// Mittens.js - ImageJ Plugin
// Author: TTL
// Version: 1.0
// Description: A plugin for generating fixed imaging images for the ST lab.
// This script provides tools for channel duplication, merging, and alignment.


/**
 * Mittens
 *
 * A plugin for ImageJ/Fiji that provides:
 * - Channel duplication, splitting, and inversion.
 * - Selective channel merging.
 * - Channel alignment and montage creation.
 * - Scale bar addition with preserved pixel size.
 *
 * Installation:
 * 1. Save this script as "ExtendedChannelTool.js" in the "plugins" folder of ImageJ/Fiji.
 * 2. Restart ImageJ/Fiji.
 * 3. The plugin will appear under "Plugins > Extended Channel Tool".
 *
 * @author Tsung-Lin Tsai
 */

/*
 * Extended Channel Tool Script for ImageJ
 * 
 * This script provides the following functionalities:
 * 1. "Dup / Split / Invert": Duplicates the current slice, splits it into (up to) four 8-bit channels,
 *    inverts them, and displays them for further processing.
 * 2. "Create Merge Only": Duplicates the current slice, splits it, converts each split to 16-bit,
 *    merges the channels selected via merge checkboxes, forces RGB color, copies calibration data,
 *    and either shows the merged image (when called independently) or hides it (when used during alignment).
 * 3. "Align Selected Images (+ Merged)": For each alignment choice, generates a hidden 16-bit duplicate
 *    for a selected channel or regenerates a hidden merged image if "Merge" is chosen, and then stacks these
 *    images side-by-side into an aligned montage. The montage inherits calibration from the original image.
 * 4. "Add Scale Bar": Opens ImageJ's Scale Bar tool.
 * 5. "Close All Except Original": Closes all windows except the original image.
 *
 * Debug logging is available via the debugLog() function; its calls are currently commented out.
 */

// Import necessary ImageJ classes
importClass(Packages.ij.IJ);
importClass(Packages.ij.ImagePlus);
importClass(Packages.ij.WindowManager);
importClass(Packages.ij.plugin.ChannelSplitter);
importClass(Packages.ij.plugin.RGBStackMerge);
importClass(Packages.ij.gui.NonBlockingGenericDialog);
importClass(Packages.ij.process.ImageProcessor);

// === Global image references ===
var originalImage = null;
var duplicatedCroppedImage = null;
// Array to hold the visible (8-bit) split/inverted channels.
var splitInvertedChannels = new Array(4);
// Final aligned (montage) image.
var finalAlignedImage = null;

// === Global UI component references ===
var mainUIDialog = null;
var mergeCheckboxes = null;    // Vector of merge checkboxes.
var alignmentChoices = null;   // Vector of alignment drop-down (Choice) components.

// Global counter for unique duplicate titles (used for merge creation).
var mergeCount = 1;

// Base channel options for alignment. The special "Merge" option regenerates the merged image.
var baseChannelOptions = ["None", "Ch1", "Ch2", "Ch3", "Ch4", "Merge"];

// --- Helper function for debug logging ---
// Uncomment the IJ.log line below to enable debug logging.
function debugLog(message) {
    // IJ.log("[DEBUG] " + message);
}

////////////////////////////////////////
// (1) Function: Open Brightness/Contrast Tool
////////////////////////////////////////
function openBrightnessContrast() {
    IJ.run("Brightness/Contrast...", "");
}

////////////////////////////////////////
// (2) Function: Duplicate, Split, and Invert Current Slice
////////////////////////////////////////
function duplicateSplitInvert() {
    originalImage = IJ.getImage();
    if (!originalImage) {
        IJ.showMessage("Error", "No image is open!");
        return;
    }
    
    var currentSlice = originalImage.getSlice();
    // debugLog("Duplicating only slice " + currentSlice);
    
    // Duplicate only the current slice of the original image.
    IJ.run(originalImage, "Duplicate...", "duplicate slices=" + currentSlice + " use");
    duplicatedCroppedImage = IJ.getImage();
    
    // Split the duplicate into channels and process each one.
    var splitArr = ChannelSplitter.split(duplicatedCroppedImage);
    for (var i = 0; i < splitArr.length && i < 4; i++) {
        IJ.run(splitArr[i], "8-bit", "");
        IJ.run(splitArr[i], "Grays", "");
        IJ.run(splitArr[i], "Invert", "");
        // Set the title for the visible (8-bit) channel.
        splitArr[i].setTitle("C" + (i+1) + "-TempForMerge_" + duplicatedCroppedImage.getTitle());
        splitArr[i].show();
        splitInvertedChannels[i] = splitArr[i];
    }
    for (var k = splitArr.length; k < 4; k++) {
        splitInvertedChannels[k] = null;
    }
    
    // Log each channel's title.
    for (var j = 0; j < splitInvertedChannels.length; j++) {
        if (splitInvertedChannels[j]) {
            // debugLog("splitInvertedChannels[" + (j+1) + "]: " + splitInvertedChannels[j].getTitle());
        } else {
            // debugLog("splitInvertedChannels[" + (j+1) + "]: null");
        }
    }
    
    // Return to the original image.
    IJ.selectWindow(originalImage.getTitle());
    originalImage.setSlice(currentSlice);
    originalImage.show();
}

////////////////////////////////////////
// (3) Function: Create Merged Image
// Duplicates the current slice, splits it, converts each split to 16-bit,
// merges only the channels selected via merge checkboxes, forces RGB color,
// copies calibration data from the original image, and then either shows or hides the merged image.
////////////////////////////////////////
function createMergeOnly(showImage) {
    if (typeof showImage === "undefined") { showImage = true; }
    // debugLog("Creating merged image using main UI merge checkboxes (showImage=" + showImage + ")...");
    try {
        if (!originalImage) {
            IJ.showMessage("Error", "Original image not available.");
            return null;
        }
        
        // Read the current merge checkbox states.
        var checkboxes = [];
        for (var i = 0; i < mergeCheckboxes.size(); i++) {
            var state = mergeCheckboxes.get(i).getState();
            checkboxes.push(state);
            // debugLog("Merge Checkbox " + (i+1) + " is " + (state ? "selected" : "not selected"));
        }
        
        var currentSlice = originalImage.getSlice();
        var uniqueTitle = "C" + "TempForMerge_" + mergeCount;
        mergeCount++;
        IJ.run(originalImage, "Duplicate...", "duplicate slices=" + currentSlice + " use title=" + uniqueTitle);
        var localDup = IJ.getImage();
        
        // Split the duplicate.
        var localSplit = ChannelSplitter.split(localDup);
        // debugLog("localSplit length: " + localSplit.length);
        if (localSplit.length < 1) {
            IJ.showMessage("Error", "No channels available in the duplicated image.");
            return null;
        }
        
        // Convert each split image to 16-bit.
        for (var i = 0; i < localSplit.length; i++) {
            if (localSplit[i] != null && localSplit[i].getBitDepth() != 16) {
                IJ.run(localSplit[i], "16-bit", "");
            }
        }
        
        var toMerge = [];
        for (var j = 0; j < checkboxes.length; j++) {
            if (checkboxes[j]) {
                if (j < localSplit.length && localSplit[j] != null) {
                    // debugLog("Adding channel " + (j+1) + " to merge: " + localSplit[j].getTitle());
                    toMerge.push(localSplit[j]);
                } else {
                    // debugLog("Channel " + (j+1) + " is out of bounds or null.");
                }
            }
        }
        
        if (toMerge.length === 0) {
            // debugLog("No valid channels selected for merging.");
            localDup.changes = false;
            localDup.close();
            for (var i = 0; i < localSplit.length; i++) {
                localSplit[i].changes = false;
                localSplit[i].close();
            }
            return null;
        }
        
        // Merge the selected channels.
        var mergedImage = RGBStackMerge.mergeChannels(toMerge, false);
        IJ.run(mergedImage, "RGB Color", ""); // Force RGB to get a color merged image.
        mergedImage.setTitle("Merged_" + toMerge.map(function(img) { return img.getTitle(); }).join("_"));
        // Copy calibration data from the original image.
        var cal = originalImage.getCalibration();
        var mergedCal = mergedImage.getCalibration();
        mergedCal.pixelWidth = cal.pixelWidth;
        mergedCal.pixelHeight = cal.pixelHeight;
        mergedCal.unit = cal.unit;
        
        if (showImage) {
            mergedImage.show();
        } else {
            mergedImage.hide(); // Hide background merge during alignment.
        }
        // debugLog("Stored merged image (Merge Only): " + mergedImage.getTitle());
        
        // Clean up temporary duplicates.
        localDup.changes = false;
        for (var i = 0; i < localSplit.length; i++) {
            localSplit[i].changes = false;
        }
        localDup.close();
        for (var i = 0; i < localSplit.length; i++) {
            localSplit[i].close();
        }
        
        return mergedImage;
    } catch (error) {
        // debugLog("Error creating merged image: " + error.message);
        return null;
    }
}

////////////////////////////////////////
// (4) Function: Generate a Hidden 16-bit Copy for a Given Channel
// For a channel selection such as "Ch1", duplicates the corresponding visible 8-bit image,
// converts it to 16-bit (if necessary), copies calibration data, hides it, and returns the copy.
////////////////////////////////////////
function getChannelImage16OnTheFly(chStr) {
    if (!chStr.startsWith("Ch")) return null;
    var idx = parseInt(chStr.substring(2), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= splitInvertedChannels.length) {
         return null;
    }
    var visImp = splitInvertedChannels[idx];
    if (visImp == null) return null;
    IJ.selectWindow(visImp.getTitle());
    IJ.run(visImp, "Duplicate...", "duplicate");
    var dup = IJ.getImage();
    if (dup.getBitDepth() != 16) {
        IJ.run(dup, "16-bit", "");
    }
    dup.setTitle("16bit_" + visImp.getTitle());
    var cal = originalImage.getCalibration();
    var dupCal = dup.getCalibration();
    dupCal.pixelWidth = cal.pixelWidth;
    dupCal.pixelHeight = cal.pixelHeight;
    dupCal.unit = cal.unit;
    dup.hide(); // Hide the 16-bit duplicate so it does not confuse the user.
    // debugLog("Generated 16-bit copy for " + visImp.getTitle() + ": " + dup.getTitle());
    return dup;
}

////////////////////////////////////////
// (5) Function: Align Selected Images (+ Merged)
// For each alignment choice:
// • If "Merge" is selected, regenerate a hidden merged image using the merge checkboxes.
// • If a channel (e.g., "Ch1") is selected, generate its hidden 16-bit copy.
// Then, stack the resulting images horizontally.
////////////////////////////////////////
function alignSelectedImages() {
    // debugLog("Align button pressed. Gathering selections...");
    var imagesToAlign = [];
    
    for (var i = 0; i < alignmentChoices.size(); i++) {
         var choice = alignmentChoices.get(i);
         var selection = choice.getSelectedItem();
         // debugLog("Alignment choice " + (i+1) + ": " + selection);
         if (selection === "Merge") {
              var mergedImage = createMergeOnly(false);
              if (mergedImage != null) {
                  imagesToAlign.push(mergedImage);
              } else {
                  // debugLog("Merge option selected but merge image creation failed.");
              }
         } else if (selection !== "None") {
              var img16 = getChannelImage16OnTheFly(selection);
              if (img16 != null) {
                  imagesToAlign.push(img16);
              } else {
                  // debugLog("No valid 16-bit image generated for selection: " + selection);
              }
         }
    }
    
    if (imagesToAlign.length < 2) {
         // debugLog("Not enough images selected for alignment.");
         IJ.showMessage("Stacking Error", "Need at least 2 images to create a horizontal stack.");
         return;
    }
    finalAlignedImage = stackImagesHorizontally(imagesToAlign);
    IJ.selectWindow(finalAlignedImage.getTitle())
}

////////////////////////////////////////
// (6) Function: Stack an Array of ImagePlus Objects Horizontally
// Logs the image titles (if debug enabled), computes total width and height,
// creates a new blank image (RGB if any input is RGB; otherwise, based on the bit depth of the first image),
// copies each image into the correct horizontal offset, copies calibration from the first image,
// and shows the resulting montage.
////////////////////////////////////////
function stackImagesHorizontally(images) {
    // IJ.log("Stacking images: " + images.map(function(img){ return img.getTitle(); }).join(", "));
    if (images.length < 2) {
        IJ.showMessage("Stacking Error", "Need at least 2 images to create a horizontal stack.");
        return null;
    }
    var width = images.reduce(function(sum, img) { return sum + img.getWidth(); }, 0);
    var height = Math.max.apply(null, images.map(function(img) { return img.getHeight(); }));
    
    // Determine the output image type.
    var anyRGB = images.some(function(img) {
        return img.getBitDepth() == 24;
    });
    
    var stack;
    if (anyRGB) {
        stack = IJ.createImage("Stacked", "RGB Color", width, height, 1);
    } else {
        var bd = images[0].getBitDepth();
        if (bd == 16) {
            stack = IJ.createImage("Stacked", "16-bit black", width, height, 1);
        } else {
            stack = IJ.createImage("Stacked", "8-bit black", width, height, 1);
        }
    }
    var ip = stack.getProcessor();
    var xOffset = 0;
    images.forEach(function(img) {
        var proc = img.getProcessor();
        if (anyRGB && img.getBitDepth() != 24) {
            proc = proc.convertToRGB();
        }
        ip.insert(proc, xOffset, 0);
        xOffset += img.getWidth();
    });
    
    // Copy calibration from the first image.
    var cal = images[0].getCalibration();
    var stackCal = stack.getCalibration();
    stackCal.pixelWidth = cal.pixelWidth;
    stackCal.pixelHeight = cal.pixelHeight;
    stackCal.unit = cal.unit;
    
    stack.show();
    return stack;
}

////////////////////////////////////////
// (7) Function: Close All Windows Except the Original Image
////////////////////////////////////////
function closeAllExceptOriginal() {
    if (!originalImage) {
        IJ.showMessage("Error", "Original image not found!");
        return;
    }
    var windows = WindowManager.getImageTitles();
    for (var i = 0; i < windows.length; i++) {
        if (windows[i] !== originalImage.getTitle()) {
            var img = WindowManager.getImage(windows[i]);
            if (img) {
                img.changes = false;
                img.close();
            }
        }
    }
    originalImage.show();
    IJ.selectWindow(originalImage.getTitle());
}

////////////////////////////////////////
// (8) Function: Open Scale Bar Tool
////////////////////////////////////////
function openScaleBar() {
    IJ.run("Scale Bar...", "");
}

////////////////////////////////////////
// (9) Main: Initialize the UI Dialog
////////////////////////////////////////
function main() {
    // debugLog("Initializing UI elements...");
    mainUIDialog = new NonBlockingGenericDialog("Mittens");
    
    // Button: Open Brightness/Contrast
    mainUIDialog.addButton("Open B&C", function() { openBrightnessContrast(); });
    mainUIDialog.addMessage(" ");
    
    // Button: Duplicate / Split / Invert
    mainUIDialog.addButton("Dup / Split / Invert", function() { duplicateSplitInvert(); });
    mainUIDialog.addMessage(" ");
    
    // Merge Checkboxes
    mainUIDialog.addMessage("Select channels to merge :                                                     ");
    mainUIDialog.addCheckbox("Ch1", false);
    mainUIDialog.addCheckbox("Ch2", false);
    mainUIDialog.addCheckbox("Ch3", false);
    mainUIDialog.addCheckbox("Ch4", false);
    mergeCheckboxes = mainUIDialog.getCheckboxes();
    // debugLog("Number of merge checkboxes: " + mergeCheckboxes.size());
    
    // Button: Create Merge Only (independent display)
    //mainUIDialog.addMessage("To create a merged image independently, click below.");
    mainUIDialog.addButton("Create Merge Only", function() { createMergeOnly(true); });
    mainUIDialog.addMessage(" ");
    
    // Alignment Choices
    mainUIDialog.addMessage("Select channels to align :");
    for (var i = 1; i <= 5; i++) {
        mainUIDialog.addChoice("Image " + i + ":", baseChannelOptions, "None");
    }
    alignmentChoices = mainUIDialog.getChoices();
    mainUIDialog.addMessage(" ");
    
    // Button: Align Selected Images (+ Merged)
    mainUIDialog.addButton("Align Selected Images", function() { alignSelectedImages(); });
    mainUIDialog.addMessage(" ");
    
    // Button: Add Scale Bar (opens scale bar tool)
    mainUIDialog.addButton("Add Scale Bar", function() { openScaleBar(); });
    mainUIDialog.addMessage(" ");
    
    // Button: Close All Except Original
    mainUIDialog.addButton("Close generated images", function() { closeAllExceptOriginal(); });
    
    mainUIDialog.showDialog();
}

main();