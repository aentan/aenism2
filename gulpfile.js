var gulp         = require("gulp"),
    concat       = require('gulp-concat'),
    sass         = require("gulp-sass"),
    autoprefixer = require("gulp-autoprefixer"),
    hash         = require("gulp-hash"),
    del          = require("del"),
    svgmin       = require('gulp-svgmin')

// Compile SCSS files to CSS
gulp.task("scss", function () {

    //Delete our old css files
    del(["static/css/**/*"])

    //compile hashed css files
    gulp.src(["static/vendor/css/**/*", "static/src/scss/main.scss"])
        .pipe(sass({
            outputStyle : "compressed"
        }))
        .pipe(autoprefixer({
            browsers : ["last 20 versions"]
        }))
        .pipe(concat('main.css'))
        .pipe(hash())
        .pipe(gulp.dest("static/css"))
        //Create a hash map
        .pipe(hash.manifest("hash.json"))
        //Put the map in the data directory
        .pipe(gulp.dest("data/css"))
})

// Watch asset folder for changes
gulp.task("watch", ["scss"], function () {
    gulp.watch("static/src/scss/**/*", ["scss"])
})

// Hash images
gulp.task("img", function () {
    del(["static/img/**/*"])
    gulp.src("static/src/img/**/*")
        // .pipe(hash())
        .pipe(gulp.dest("static/img"))
        // .pipe(hash.manifest("hash.json"))
        //.pipe(gulp.dest("data/img"))
})

// Hash SVG
gulp.task("svg", function () {
    del(["static/svg/**/*"])
    gulp.src("static/src/svg/**/*")
        .pipe(svgmin())
        // .pipe(hash())
        .pipe(gulp.dest("layouts/partials/svg"))
        // .pipe(hash.manifest("hash.json"))
        //.pipe(gulp.dest("data/img"))
})

// Hash javascript
gulp.task("js", function () {
    del(["static/js/**/*"])
    gulp.src(["static/vendor/js/**/*", "static/src/js/**/*"])
        .pipe(concat('main.js'))
        .pipe(hash())
        .pipe(gulp.dest("static/js"))
        .pipe(hash.manifest("hash.json"))
        .pipe(gulp.dest("data/js"))
})

// Watch asset folder for changes
gulp.task("watch", ["scss", "img", "svg", "js"], function () {
    gulp.watch("static/src/scss/**/*", ["scss"])
    gulp.watch("static/src/img/**/*", ["img"])
    gulp.watch("static/src/svg/**/*", ["svg"])
    gulp.watch("static/src/js/**/*", ["js"])
})

// Set watch as default task
gulp.task("default", ["watch"])