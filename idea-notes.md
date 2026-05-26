# ObiTracker - MVP Ideas

### Main idea
A web app that provides a compact way to manage obedience dog training - for people that train obedience with their dogs on different levels 
Each user should be able to add multiple dogs, and all views described below should be available separately for each dog.

First view – daily training tracker

A grid for tracking exercises trained on the current day:
The first column should contain custom training elements defined by the user.
The first row should contain dates (the previous 28 days, the current day, and the next day).
Each cell in the grid (except the first row and first column) should contain a checkbox that the user can tick if a particular exercise was trained on a given day.

The app should:
calculate the training frequency for each element over the last 30 days,
highlight the two most frequently practiced elements,
highlight the two least frequently practiced elements.

The goal is to make it easy to see which exercises may be overtrained and which are being neglected.

Second view – competition results tracker

A view for saving results from obedience competitions.

The system should:

calculate the average score for each exercise,
highlight the two strongest exercises,
highlight the two weakest exercises.

Competition classes and exercises should be predefined according to the official rules.
The user should be able to:

choose a class,
add competition results for that class,
later switch to another class and start adding results there as well.

Average scores should be calculated separately for each class. For example, if both Class 1 and Class 2 contain the exercise “heelwork,” the averages for that exercise should be tracked independently for each class.

### Basic functionalities (MVP)
- Each user has their own account with login functionality.
- Each user can add multiple dogs.
- For each dog, the user can define training elements.
- For each dog, the user can select/unselect which elements were practiced during the current day’s training session.
- The app calculates the training frequency for each element over the previous 30 days and highlights which elements are overtrained and which are being neglected.
- For each dog, the user can add competition results. Based on all competitions in the current class, the app calculates the average score for each exercise and highlights the strongest and weakest exercises.

### What is not a part of MVP
- Marking elements as priorities or excluding them from frequency calculations.
- Linking training elements with competition exercises.
- Suggesting what should be trained based on competition results.
- Adding notes.