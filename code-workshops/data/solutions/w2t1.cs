using System;
class Program
{
    static void Main()
    {
        int n = int.Parse(Console.ReadLine());
        if (n % 2 == 0)
        {
            Console.WriteLine("מספר זוגי");
        }
        else
        {
            Console.WriteLine("מספר אי-זוגי");
        }
        if (n > 0)
        {
            Console.WriteLine("חיובי");
        }
        else if (n < 0)
        {
            Console.WriteLine("שלילי");
        }
        else
        {
            Console.WriteLine("אפס");
        }
    }
}