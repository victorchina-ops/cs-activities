using System;
class Program
{
    static bool IsLeapYear(int year)
    {
        if (year % 400 == 0)
        {
            return true;
        }
        if (year % 100 == 0)
        {
            return false;
        }
        return year % 4 == 0;
    }
    static void Main()
    {
        int year = int.Parse(Console.ReadLine());
        if (IsLeapYear(year))
        {
            Console.WriteLine("שנה מעוברת");
        }
        else
        {
            Console.WriteLine("שנה רגילה");
        }
    }
}