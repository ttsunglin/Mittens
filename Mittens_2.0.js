// Mittens.js - ImageJ Plugin
// Author: TTL
// Version: 2.0
// Description: A plugin for generating fixed imaging images for the ST lab.
// This script provides tools for channel duplication, merging, alignment with time frame support,
// and movie export capabilities.


/**
 * Mittens
 *
 * A plugin for ImageJ/Fiji that provides:
 * - Channel duplication, splitting, and inversion.
 * - Selective channel merging.
 * - Channel alignment and montage creation.
 * - Scale bar addition with preserved pixel size.
 * - Time frame support for multi-dimensional images.
 * - Time bar addition for temporal data visualization.
 *
 * Installation:
 * 1. Save this script as "Mittens_2.0.js" in the "plugins" folder of ImageJ/Fiji.
 * 2. Restart ImageJ/Fiji.
 * 3. The plugin will appear under "Plugins > Mittens".
 *
 * @author Tsung-Lin Tsai
 * @version 2.0
 */

/*
 * Mittens 2.0 Script for ImageJ
 * 
 * This script provides the following functionalities:
 * 1. "Dup / Split / Invert": Duplicates the current slice (or full T-stack if "use frames" is checked),
 *    splits it into (up to) four 8-bit channels, inverts them, and displays them for further processing.
 * 2. "Create Merge Only": Duplicates the current slice (or full T-stack), splits it, converts each split to 16-bit,
 *    merges the channels selected via merge checkboxes, forces RGB color, copies calibration data,
 *    and either shows the merged image (when called independently) or hides it (when used during alignment).
 * 3. "Align Selected Images (+ Merged)": For each alignment choice, generates a hidden 16-bit duplicate
 *    for a selected channel or regenerates a hidden merged image if "Merge" is chosen, and then stacks these
 *    images side-by-side into an aligned montage. The montage inherits calibration from the original image.
 * 4. "Add Scale Bar": Opens ImageJ's Scale Bar tool.
 * 5. "Movie Export": Opens a window with movie export options including:
 *    - Properties: Opens ImageJ's Properties dialog.
 *    - Add Time Bar: Opens the Time Bar plugin if installed.
 *    - Scale and Export: Scales image 3x and exports as AVI.
 * 6. "Close All Except Original": Closes all windows except the original image.
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
importClass(Packages.ij.Macro);
importClass(Packages.ij.ImageStack);

// === Global image references ===
var originalImage = null;
var duplicatedCroppedImage = null;
// Array to hold the visible (8-bit) split/inverted channels.
var splitInvertedChannels = new Array(4);
// Array to hold the full time stack versions when useFrames is true
var splitInvertedChannelsFullStack = new Array(4);
// Final aligned (montage) image.
var finalAlignedImage = null;

// === Global UI component references ===
var mainUIDialog = null;
var mergeCheckboxes = null;    // Vector of merge checkboxes.
var alignmentChoices = null;   // Vector of alignment drop-down (Choice) components.
var useFramesCheckbox = null;  // Checkbox for using all time frames.

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
// (2) Function: Duplicate, Split, and Invert Current Slice or Full T-Stack
////////////////////////////////////////
function duplicateSplitInvert() {
    originalImage = IJ.getImage();
    if (!originalImage) {
        IJ.showMessage("Error", "No image is open!");
        return;
    }
    
    var useFrames = useFramesCheckbox.getState();
    var currentSlice = originalImage.getSlice();
    var nFrames = originalImage.getNFrames();
    var nSlices = originalImage.getNSlices();
    var nChannels = originalImage.getNChannels();
    
    // debugLog("Use frames: " + useFrames + ", nFrames: " + nFrames + ", current slice: " + currentSlice);
    
    // Calculate current Z and T position
    var currentZ = ((currentSlice - 1) % (nSlices * nChannels)) / nChannels + 1;
    currentZ = Math.floor(currentZ);
    
    var duplicateCommand;
    if (useFrames && nFrames > 1) {
        // Duplicate all frames for the current Z position
        // debugLog("Duplicating all frames for Z=" + currentZ);
        duplicateCommand = "Duplicate...";
        if (nSlices > 1) {
            IJ.run(originalImage, duplicateCommand, "duplicate slices=" + currentZ + " frames=1-" + nFrames);
        } else {
            IJ.run(originalImage, duplicateCommand, "duplicate frames=1-" + nFrames);
        }
    } else {
        // Original behavior: duplicate only the current slice
        // debugLog("Duplicating only slice " + currentSlice);
        IJ.run(originalImage, "Duplicate...", "duplicate slices=" + currentSlice + " use");
    }
    
    duplicatedCroppedImage = IJ.getImage();
    
    // Handle time stack: process each frame if we have multiple frames
    if (useFrames && duplicatedCroppedImage.getNFrames() > 1) {
        // For time stacks, split all frames and process them
        var nF = duplicatedCroppedImage.getNFrames();
        
        // Split the full time stack
        var splitArr = ChannelSplitter.split(duplicatedCroppedImage);
        
        for (var i = 0; i < splitArr.length && i < 4; i++) {
            // Process each channel's time stack
            IJ.run(splitArr[i], "8-bit", "");
            IJ.run(splitArr[i], "Grays", "");
            
            // Invert the entire stack at once using "stack" option
            // This avoids the popup dialog for each frame
            IJ.run(splitArr[i], "Invert", "stack");
            
            splitArr[i].setTitle("C" + (i+1) + "-TempForMerge_" + originalImage.getTitle());
            splitArr[i].show();
            splitInvertedChannels[i] = splitArr[i];
            
            // Store the full stack reference
            splitInvertedChannelsFullStack[i] = splitArr[i];
        }
        for (var k = splitArr.length; k < 4; k++) {
            splitInvertedChannels[k] = null;
            splitInvertedChannelsFullStack[k] = null;
        }
    } else {
        // Original behavior for single frames
        var splitArr = ChannelSplitter.split(duplicatedCroppedImage);
        for (var i = 0; i < splitArr.length && i < 4; i++) {
            IJ.run(splitArr[i], "8-bit", "");
            IJ.run(splitArr[i], "Grays", "");
            IJ.run(splitArr[i], "Invert", "");
            splitArr[i].setTitle("C" + (i+1) + "-TempForMerge_" + duplicatedCroppedImage.getTitle());
            splitArr[i].show();
            splitInvertedChannels[i] = splitArr[i];
            splitInvertedChannelsFullStack[i] = null;
        }
        for (var k = splitArr.length; k < 4; k++) {
            splitInvertedChannels[k] = null;
            splitInvertedChannelsFullStack[k] = null;
        }
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
// (3) Function: Create Merged Image with Time Frame Support
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
        
        var useFrames = useFramesCheckbox.getState();
        var currentSlice = originalImage.getSlice();
        var nFrames = originalImage.getNFrames();
        var nSlices = originalImage.getNSlices();
        var nChannels = originalImage.getNChannels();
        
        // Calculate current Z position
        var currentZ = ((currentSlice - 1) % (nSlices * nChannels)) / nChannels + 1;
        currentZ = Math.floor(currentZ);
        
        var uniqueTitle = "C" + "TempForMerge_" + mergeCount;
        mergeCount++;
        
        if (useFrames && nFrames > 1) {
            // Duplicate all frames for the current Z position
            if (nSlices > 1) {
                IJ.run(originalImage, "Duplicate...", "duplicate slices=" + currentZ + " frames=1-" + nFrames + " title=" + uniqueTitle);
            } else {
                IJ.run(originalImage, "Duplicate...", "duplicate frames=1-" + nFrames + " title=" + uniqueTitle);
            }
        } else {
            // Original behavior
            IJ.run(originalImage, "Duplicate...", "duplicate slices=" + currentSlice + " use title=" + uniqueTitle);
        }
        
        var localDup = IJ.getImage();
        
        // Handle time stacks
        if (useFrames && localDup.getNFrames() > 1) {
            // Split all channels from the time stack
            var splitStacks = ChannelSplitter.split(localDup);
            
            // Convert each channel stack to 16-bit
            for (var i = 0; i < splitStacks.length; i++) {
                if (splitStacks[i] != null && splitStacks[i].getBitDepth() != 16) {
                    IJ.run(splitStacks[i], "16-bit", "");
                }
            }
            
            // Collect channels to merge based on checkboxes
            var toMerge = [];
            for (var j = 0; j < checkboxes.length; j++) {
                if (checkboxes[j] && j < splitStacks.length && splitStacks[j] != null) {
                    toMerge.push(splitStacks[j]);
                }
            }
            
            if (toMerge.length > 0) {
                // Merge all frames at once
                var mergedStack = RGBStackMerge.mergeChannels(toMerge, false);
                IJ.run(mergedStack, "RGB Color", "");
                mergedStack.setTitle("Merged_TimeStack_" + uniqueTitle);
                
                // Copy calibration
                var cal = originalImage.getCalibration();
                var mergedCal = mergedStack.getCalibration();
                mergedCal.pixelWidth = cal.pixelWidth;
                mergedCal.pixelHeight = cal.pixelHeight;
                mergedCal.unit = cal.unit;
                mergedCal.frameInterval = cal.frameInterval;
                mergedCal.fps = cal.fps;
                
                // Reset to first frame
                mergedStack.setSlice(1);
                
                if (showImage) {
                    mergedStack.show();
                } else {
                    mergedStack.hide();
                }
                
                // Clean up
                localDup.changes = false;
                localDup.close();
                for (var i = 0; i < splitStacks.length; i++) {
                    if (splitStacks[i] != null) {
                        splitStacks[i].changes = false;
                        splitStacks[i].close();
                    }
                }
                
                return mergedStack;
            }
        } else {
            // Original single-frame behavior
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
        }
    } catch (error) {
        // debugLog("Error creating merged image: " + error.message);
        return null;
    }
}

////////////////////////////////////////
// (4) Function: Generate a Hidden 16-bit Copy for a Given Channel
// For a channel selection such as "Ch1", duplicates the corresponding visible 8-bit image,
// converts it to 16-bit (if necessary), copies calibration data, hides it, and returns the copy.
// Now handles full time stacks when useFrames is enabled.
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
    
    // Check if we have a time stack version
    var useFrames = useFramesCheckbox.getState();
    if (useFrames && visImp.getNFrames() > 1) {
        // Duplicate the full time stack
        IJ.run(visImp, "Duplicate...", "duplicate frames=1-" + visImp.getNFrames());
    } else {
        // Original behavior for single frames
        IJ.run(visImp, "Duplicate...", "duplicate");
    }
    
    var dup = IJ.getImage();
    // Convert to 16-bit if necessary (without modifying pixel values)
    if (dup.getBitDepth() != 16) {
        IJ.run(dup, "16-bit", "");
    }
    dup.setTitle("16bit_" + visImp.getTitle());
    
    // Copy calibration including time calibration
    var cal = originalImage.getCalibration();
    var dupCal = dup.getCalibration();
    dupCal.pixelWidth = cal.pixelWidth;
    dupCal.pixelHeight = cal.pixelHeight;
    dupCal.unit = cal.unit;
    if (dup.getNFrames() > 1) {
        dupCal.frameInterval = cal.frameInterval;
        dupCal.fps = cal.fps;
    }
    
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
    
    // Check if any image has time frames
    var hasTimeFrames = false;
    var maxFrames = 1;
    for (var i = 0; i < images.length; i++) {
        var nF = images[i].getNFrames();
        if (nF > 1) {
            hasTimeFrames = true;
            if (nF > maxFrames) maxFrames = nF;
        }
    }
    
    var width = images.reduce(function(sum, img) { return sum + img.getWidth(); }, 0);
    var height = Math.max.apply(null, images.map(function(img) { return img.getHeight(); }));
    
    // Determine the output image type.
    var anyRGB = images.some(function(img) {
        return img.getBitDepth() == 24;
    });
    
    var stack;
    if (hasTimeFrames) {
        // Create a hyperstack with time frames (not slices)
        var imgStack;
        if (anyRGB) {
            imgStack = new ImageStack(width, height);
            for (var f = 1; f <= maxFrames; f++) {
                imgStack.addSlice(IJ.createImage("frame", "RGB", width, height, 1).getProcessor());
            }
            stack = new ImagePlus("Stacked", imgStack);
            stack.setDimensions(1, 1, maxFrames); // nChannels, nSlices, nFrames
        } else {
            var bd = images[0].getBitDepth();
            imgStack = new ImageStack(width, height);
            for (var f = 1; f <= maxFrames; f++) {
                if (bd == 16) {
                    imgStack.addSlice(IJ.createImage("frame", "16-bit black", width, height, 1).getProcessor());
                } else {
                    imgStack.addSlice(IJ.createImage("frame", "8-bit black", width, height, 1).getProcessor());
                }
            }
            stack = new ImagePlus("Stacked", imgStack);
            stack.setDimensions(1, 1, maxFrames); // nChannels, nSlices, nFrames
        }
        
        // Process each time frame
        for (var f = 1; f <= maxFrames; f++) {
            // Set the frame for the output stack
            stack.setSlice(f);
            var ip = stack.getProcessor();
            var xOffset = 0;
            
            for (var i = 0; i < images.length; i++) {
                var img = images[i];
                var proc;
                
                if (img.getNFrames() >= f) {
                    // Set frame and get a fresh processor
                    img.setSlice(f);
                    proc = img.getProcessor().duplicate();
                } else if (img.getNFrames() > 0) {
                    // Use last available frame if this image has fewer frames
                    img.setSlice(img.getNFrames());
                    proc = img.getProcessor().duplicate();
                } else {
                    proc = img.getProcessor().duplicate();
                }
                
                if (anyRGB && img.getBitDepth() != 24) {
                    proc = proc.convertToRGB();
                }
                ip.insert(proc, xOffset, 0);
                xOffset += img.getWidth();
            }
        }
    } else {
        // Original behavior for single frames
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
    }
    
    // Copy calibration from the first image.
    var cal = images[0].getCalibration();
    var stackCal = stack.getCalibration();
    stackCal.pixelWidth = cal.pixelWidth;
    stackCal.pixelHeight = cal.pixelHeight;
    stackCal.unit = cal.unit;
    if (hasTimeFrames) {
        stackCal.frameInterval = cal.frameInterval;
        stackCal.fps = cal.fps;
    }
    
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
    try {
        IJ.run("Scale Bar...", "");
    } catch (e) {
        // User canceled the dialog - ignore the error
    }
}

////////////////////////////////////////
// (9) Function: Open Properties Dialog
////////////////////////////////////////
function openProperties() {
    try {
        IJ.run("Properties...", "");
    } catch (e) {
        // User canceled the dialog - ignore the error
    }
}

////////////////////////////////////////
// (10) Function: Open Time Bar Plugin
////////////////////////////////////////
function openTimeBar() {
    try {
        // Try to run the Time Bar plugin
        IJ.run("Time Bar", "");
    } catch (e) {
        // If the plugin is not installed, show an error message
        IJ.showMessage("Time Bar Not Found", 
            "Please install the Time Bar plugin from the ImageJ update site.\n\n" +
            "Go to: Help > Update... > Manage update sites\n" +
            "And enable the appropriate update site with Time Bar plugin.");
    }
}

////////////////////////////////////////
// (11) Function: Scale and Export - Scale image 3x and export as AVI
////////////////////////////////////////
function scaleAndExport() {
    var img = IJ.getImage();
    if (!img) {
        IJ.showMessage("Error", "No image is open!");
        return;
    }
    
    // Duplicate the image to avoid modifying the original
    IJ.run(img, "Duplicate...", "duplicate");
    var dupImg = IJ.getImage();
    
    // Scale the image by 3x
    var width = dupImg.getWidth();
    var height = dupImg.getHeight();
    var newWidth = width * 3;
    var newHeight = height * 3;
    
    IJ.run(dupImg, "Size...", "width=" + newWidth + " height=" + newHeight + 
           " depth=" + dupImg.getNFrames() + " constrain interpolation=Bicubic");
    
    // Open AVI export dialog
    IJ.run(dupImg, "AVI... ", "");
}

////////////////////////////////////////
// (12) Function: Open Movie Export Window
////////////////////////////////////////
function openMovieExportWindow() {
    // Create a simple menu using IJ.showMessageWithCancel and multiple options
    var html = "<html>" +
        "<h3>Movie Export Options</h3>" +
        "<p>Choose an option number:</p>" +
        "<ol>" +
        "<li><b>Properties</b> - View/edit image properties</li>" +
        "<li><b>Add Time Bar</b> - Add temporal annotation</li>" +
        "<li><b>Scale and Export</b> - Scale 3x and export as AVI</li>" +
        "</ol>" +
        "</html>";
    
    importClass(Packages.ij.gui.GenericDialog);
    var gd = new GenericDialog("Movie Export");
    gd.addMessage(html);
    gd.addNumericField("Enter option (1-3):", 1, 0);
    gd.showDialog();
    
    if (gd.wasCanceled()) {
        return;
    }
    
    var choice = parseInt(gd.getNextNumber());
    
    switch(choice) {
        case 1:
            openProperties();
            break;
        case 2:
            openTimeBar();
            break;
        case 3:
            scaleAndExport();
            break;
        default:
            IJ.showMessage("Invalid option", "Please enter 1, 2, or 3");
    }
}

////////////////////////////////////////
// (13) Main: Initialize the UI Dialog
////////////////////////////////////////
function main() {
    // debugLog("Initializing UI elements...");
    mainUIDialog = new NonBlockingGenericDialog("Mittens v2.0");
    
    // Button: Open Brightness/Contrast
    mainUIDialog.addButton("Open Brightness/Contrast", function() { openBrightnessContrast(); });
    
    // Button: Duplicate / Split / Invert with "use frames" checkbox
    mainUIDialog.addButton("Dup / Split / Invert", function() { duplicateSplitInvert(); });
    mainUIDialog.addToSameRow();
    mainUIDialog.addCheckbox("use frames", false);
    var checkboxVector = mainUIDialog.getCheckboxes();
    useFramesCheckbox = checkboxVector.get(checkboxVector.size() - 1);
    
    // Merge Checkboxes
    mainUIDialog.addMessage("Select channels to merge :                                                     ");
    mainUIDialog.addCheckbox("Ch1", false);
    mainUIDialog.addCheckbox("Ch2", false);
    mainUIDialog.addCheckbox("Ch3", false);
    mainUIDialog.addCheckbox("Ch4", false);
    mergeCheckboxes = mainUIDialog.getCheckboxes();
    // Exclude the "use frames" checkbox from merge checkboxes
    var tempMergeCheckboxes = new java.util.Vector();
    for (var i = 1; i < mergeCheckboxes.size(); i++) {
        tempMergeCheckboxes.add(mergeCheckboxes.get(i));
    }
    mergeCheckboxes = tempMergeCheckboxes;
    // debugLog("Number of merge checkboxes: " + mergeCheckboxes.size());
    
    // Button: Create Merge Only (independent display)
    mainUIDialog.addButton("Create Merge Only", function() { createMergeOnly(true); });
    
    // Alignment Choices
    mainUIDialog.addMessage("Select channels to align :");
    for (var i = 1; i <= 5; i++) {
        mainUIDialog.addChoice("Image " + i + ":", baseChannelOptions, "None");
    }
    alignmentChoices = mainUIDialog.getChoices();
    
    // Button: Align Selected Images (+ Merged)
    mainUIDialog.addButton("Align Selected Images", function() { alignSelectedImages(); });
    
    // Button: Add Scale Bar (opens scale bar tool)
    mainUIDialog.addButton("Add Scale Bar", function() { openScaleBar(); });
    
    // Movie Export section
    mainUIDialog.addMessage("Movie Export Tools:");
    mainUIDialog.addButton("Properties", function() { openProperties(); });
    mainUIDialog.addButton("Add Time Bar", function() { openTimeBar(); });
    mainUIDialog.addButton("Scale and Export (3x + AVI)", function() { scaleAndExport(); });
    
    // Spacing before close button
    mainUIDialog.addMessage(" ");
    
    // Button: Close All Except Original
    mainUIDialog.addButton("Close generated images", function() { closeAllExceptOriginal(); });
    
    mainUIDialog.showDialog();
}

main();